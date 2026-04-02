import { searchMenus } from "./lib/search.ts";
import { filterSelectableChainIds, filterSelectableChains } from "./lib/chain-selection.ts";
import type { Dataset, QueryState, SearchInput, SearchResponse, SearchResult } from "./lib/types.ts";
import { buildShareUrl, readQueryState, writeQueryState } from "./lib/url-state.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app が見つかりません");
}

const initialState = readQueryState();

const state: QueryState = {
  budgetMin: initialState.budgetMin,
  budgetMax: initialState.budgetMax,
  calorieMin: initialState.calorieMin,
  calorieMax: initialState.calorieMax,
  proteinMin: initialState.proteinMin,
  proteinMax: initialState.proteinMax,
  chains: [...initialState.chains],
};

let lastResponse: SearchResponse | null = null;
let latestDraw: SearchResult[] = [];
let drawVersion = 0;

function inputState(): SearchInput {
  return {
    budgetMin: state.budgetMin,
    budgetMax: state.budgetMax,
    calorieMin: state.calorieMin,
    calorieMax: state.calorieMax,
    proteinMin: state.proteinMin,
    proteinMax: state.proteinMax,
    chainIds: state.chains,
    maxItemsTotal: 5,
    candidateLimit: 200,
  };
}

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function formatOptionalNumber(value: number | null, suffix: string): string {
  return value === null ? "制約なし" : `${value}${suffix}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatJapaneseDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) {
    return date;
  }

  const [, year, month, day] = match;
  return `${Number(year)}年${Number(month)}月${Number(day)}日時点`;
}

function chainBadge(dataset: Dataset, chainId: string): string {
  const chain = dataset.chains.find((entry) => entry.id === chainId);
  return chain ? chain.name : chainId;
}

function drawResults(results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) {
    return [...results];
  }

  const maxCount = Math.min(3, results.length);
  const count = Math.floor(Math.random() * maxCount) + 1;
  return results.slice(0, count);
}

function resetDraw() {
  lastResponse = null;
  latestDraw = [];
}

function buildConstraintSummary(): string[] {
  return [
    `予算 ${formatOptionalNumber(state.budgetMin, "円")} 〜 ${formatOptionalNumber(state.budgetMax, "円")}`,
    `カロリー ${formatOptionalNumber(state.calorieMin, "kcal")} 〜 ${formatOptionalNumber(state.calorieMax, "kcal")}`,
    `タンパク質 ${formatOptionalNumber(state.proteinMin, "g")} 〜 ${formatOptionalNumber(state.proteinMax, "g")}`,
  ];
}

function render(dataset: Dataset) {
  const selectableChains = filterSelectableChains(dataset.chains);
  state.chains = filterSelectableChainIds(state.chains);
  writeQueryState(state);
  const shareUrl = buildShareUrl(state);
  const summaryLines = buildConstraintSummary();
  const hasResults = latestDraw.length > 0;
  const hasAttempted = lastResponse !== null;

  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Unofficial Reference MVP</p>
        <h1>条件指定で回す<br />メニューガチャ</h1>
        <p class="hero-copy">
          予算・カロリー・タンパク質の上下限を自由に設定し、条件を満たす組み合わせからランダムに引き当てます。
          価格・栄養値は参考情報であり、正式な購入判断には公式情報を優先してください。
        </p>
        <div class="hero-meta">
          <span>更新日 ${escapeHtml(dataset.metadata.updatedAt)}</span>
          <span>同一商品は重複なし</span>
          <span>合計5点まで探索</span>
        </div>
      </section>

      <section class="panel controls">
        <div class="panel-header">
          <h2>条件設定</h2>
          <button id="copy-share" class="ghost-button" type="button">共有URLをコピー</button>
        </div>
        <p class="section-copy">未入力の項目は制約なしとして扱います。設定後にガチャを回してください。</p>

        <div class="form-grid">
          <label>
            予算下限
            <input id="budgetMin" type="number" min="0" max="5000" step="50" value="${state.budgetMin ?? ""}" />
          </label>
          <label>
            予算上限
            <input id="budgetMax" type="number" min="0" max="5000" step="50" value="${state.budgetMax ?? ""}" />
          </label>
          <label>
            カロリー下限
            <input id="calorieMin" type="number" min="0" max="3000" step="50" value="${state.calorieMin ?? ""}" />
          </label>
          <label>
            カロリー上限
            <input id="calorieMax" type="number" min="0" max="3000" step="50" value="${state.calorieMax ?? ""}" />
          </label>
          <label>
            タンパク質下限
            <input id="proteinMin" type="number" min="0" max="200" step="1" value="${state.proteinMin ?? ""}" />
          </label>
          <label>
            タンパク質上限
            <input id="proteinMax" type="number" min="0" max="200" step="1" value="${state.proteinMax ?? ""}" />
          </label>
        </div>

        <fieldset class="chain-grid">
          <legend>対象チェーン</legend>
          ${selectableChains
            .map(
              (chain) => `
                <label class="chain-option">
                  <input type="checkbox" value="${chain.id}" ${state.chains.includes(chain.id) ? "checked" : ""} />
                  <span>${chain.name}</span>
                </label>
              `,
            )
            .join("")}
        </fieldset>

        <div class="gacha-actions">
          <button id="spin-gacha" class="gacha-button" type="button">
            ${hasAttempted ? "もう一度回す" : "ガチャを回す"}
          </button>
          <p class="action-note">条件一致の候補を最大200件まで探索し、その中から1〜3件をランダム表示します。</p>
        </div>

        <div class="scrape-summary">
          <p>データ確認日</p>
          <ul>
            ${selectableChains
              .map((chain) => `<li>${escapeHtml(chain.name)}: ${escapeHtml(formatJapaneseDate(chain.scrapeDate))}</li>`)
              .join("")}
          </ul>
          <p class="pending-note">一部チェーンは栄養データ精査中のため、現在は表示対象外です。</p>
          <p>非公式情報・参考値を含みます。最終的な購入判断は各チェーンの公式情報を確認してください。</p>
        </div>
      </section>

      <section class="panel summary">
        <div>
          <h2>探索サマリー</h2>
          <p>${
            hasAttempted
              ? `${lastResponse?.candidateCount ?? 0}件の候補から抽選しています。`
              : "まだ抽選していません。条件を決めてガチャを回してください。"
          }</p>
        </div>
        <div class="stat-row">
          ${summaryLines
            .map(
              (line) => `
                <article class="stat-card">
                  <span>条件</span>
                  <strong>${escapeHtml(line)}</strong>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>

      <section class="panel results">
        <div class="panel-header">
          <h2>ガチャ結果</h2>
          <a href="${escapeHtml(shareUrl)}" class="share-link">${escapeHtml(shareUrl)}</a>
        </div>
        ${
          hasResults
            ? `<div class="result-grid result-grid-fresh" data-draw-version="${drawVersion}">
                ${latestDraw
                  .map(
                    (result, index) => `
                      <article class="result-card">
                        <div class="result-head">
                          <div>
                            <p class="rank">Pick ${index + 1}</p>
                            <h3>${formatYen(result.totalPrice)} の組み合わせ</h3>
                          </div>
                          <strong class="score">${result.totalProtein}g</strong>
                        </div>
                        <ul class="item-list">
                          ${result.items
                            .map(
                              ({ item, quantity }) => `
                                <li>
                                  <div>
                                    <span class="item-chain">${escapeHtml(chainBadge(dataset, item.chainId))}</span>
                                    <strong>${escapeHtml(item.name)}</strong>
                                  </div>
                                  <span>${quantity}点</span>
                                </li>
                              `,
                            )
                            .join("")}
                        </ul>
                        <dl class="totals">
                          <div><dt>価格</dt><dd>${formatYen(result.totalPrice)}</dd></div>
                          <div><dt>カロリー</dt><dd>${result.totalCalories}kcal</dd></div>
                          <div><dt>タンパク質</dt><dd>${result.totalProtein}g</dd></div>
                        </dl>
                      </article>
                    `,
                  )
                  .join("")}
              </div>`
            : hasAttempted
              ? `
                <div class="empty-state">
                  <h3>${escapeHtml(lastResponse?.diagnostics?.title ?? "候補なし")}</h3>
                  <ul>
                    ${(lastResponse?.diagnostics?.details ?? [])
                      .map((detail) => `<li>${escapeHtml(detail)}</li>`)
                      .join("")}
                  </ul>
                  ${
                    lastResponse?.diagnostics?.suggestion
                      ? `<p class="suggestion">${escapeHtml(lastResponse.diagnostics.suggestion.summary)}</p>`
                      : ""
                  }
                </div>
              `
              : `
                <div class="empty-state idle-state">
                  <h3>まだガチャを回していません</h3>
                  <p>条件を入力し、対象チェーンを選んでからボタンを押してください。</p>
                </div>
              `
        }
      </section>

      <section class="panel data-sources">
        <div class="panel-header">
          <h2>データ出典</h2>
          <span class="notice">非公式・参考情報</span>
        </div>
        <p class="disclaimer">${escapeHtml(dataset.metadata.disclaimer)}</p>
        <div class="source-grid">
          ${selectableChains
            .map(
              (chain) => `
                <article class="source-card">
                  <h3>${escapeHtml(chain.name)}</h3>
                  <p>${escapeHtml(chain.sourceLabel)}</p>
                  <a href="${escapeHtml(chain.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
                    chain.sourceUrl,
                  )}</a>
                  <span>${escapeHtml(formatJapaneseDate(chain.scrapeDate))}</span>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    </main>
  `;

  bindEvents(dataset);
}

function parseOptionalValue(input: HTMLInputElement | null): number | null {
  if (!input) {
    return null;
  }

  const value = input.value.trim();
  if (value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function updateNumericState() {
  state.budgetMin = parseOptionalValue(document.querySelector<HTMLInputElement>("#budgetMin"));
  state.budgetMax = parseOptionalValue(document.querySelector<HTMLInputElement>("#budgetMax"));
  state.calorieMin = parseOptionalValue(document.querySelector<HTMLInputElement>("#calorieMin"));
  state.calorieMax = parseOptionalValue(document.querySelector<HTMLInputElement>("#calorieMax"));
  state.proteinMin = parseOptionalValue(document.querySelector<HTMLInputElement>("#proteinMin"));
  state.proteinMax = parseOptionalValue(document.querySelector<HTMLInputElement>("#proteinMax"));
}

function validateInput(): string | null {
  if (state.budgetMin !== null && state.budgetMax !== null && state.budgetMin > state.budgetMax) {
    return "予算下限は予算上限以下にしてください。";
  }

  if (state.calorieMin !== null && state.calorieMax !== null && state.calorieMin > state.calorieMax) {
    return "カロリー下限はカロリー上限以下にしてください。";
  }

  if (state.proteinMin !== null && state.proteinMax !== null && state.proteinMin > state.proteinMax) {
    return "タンパク質下限はタンパク質上限以下にしてください。";
  }

  return null;
}

function runGacha(dataset: Dataset) {
  updateNumericState();
  const error = validateInput();
  if (error) {
    window.alert(error);
    return;
  }

  lastResponse = searchMenus(dataset.items, inputState());
  latestDraw = drawResults(lastResponse.results);
  drawVersion += 1;
  render(dataset);
}

function bindEvents(dataset: Dataset) {
  document.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateNumericState();
      resetDraw();
      render(dataset);
    });
  });

  document.querySelectorAll<HTMLInputElement>('.chain-option input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const next = new Set(state.chains);
      if (checkbox.checked) {
        next.add(checkbox.value);
      } else {
        next.delete(checkbox.value);
      }
      state.chains = [...next];
      resetDraw();
      render(dataset);
    });
  });

  document.querySelector<HTMLButtonElement>("#spin-gacha")?.addEventListener("click", () => {
    runGacha(dataset);
  });

  document.querySelector<HTMLButtonElement>("#copy-share")?.addEventListener("click", async () => {
    updateNumericState();
    const text = buildShareUrl(state);
    try {
      await navigator.clipboard.writeText(text);
      window.alert("共有URLをコピーしました。");
    } catch {
      window.alert(text);
    }
  });
}

async function main() {
  const response = await fetch("./data/menu-dataset.json");
  if (!response.ok) {
    throw new Error("データセットの読み込みに失敗しました");
  }

  const dataset = (await response.json()) as Dataset;
  render(dataset);
}

void main();
