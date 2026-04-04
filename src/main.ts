import { searchMenus } from "./lib/search.ts";
import { filterSelectableChainIds, filterSelectableChains } from "./lib/chain-selection.ts";
import { constraintDefs, type ConstraintState, type Dataset, type NumericFieldId, type QueryState, type SearchInput, type SearchResponse, type SearchResult } from "./lib/types.ts";
import { buildShareUrl, readQueryState, writeQueryState } from "./lib/url-state.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app が見つかりません");
}

const state: QueryState = {
  budgetMin: null,
  budgetMax: null,
  calorieMin: null,
  calorieMax: null,
  proteinMin: null,
  proteinMax: null,
  chains: [],
};

let lastResponse: SearchResponse | null = null;
let latestDraw: SearchResult[] = [];
let drawVersion = 0;
let activeDataset: Dataset | null = null;
let statusMessage = "";
let statusTone: "success" | "error" = "success";
let statusTimeoutId: number | null = null;

type ValidationErrors = Partial<Record<NumericFieldId, string>>;

const VALIDATION_STATUS_MESSAGE = "入力内容を確認してください。";

let validationErrors: ValidationErrors = {};

function buildConstraintState(): ConstraintState {
  return Object.fromEntries(
    constraintDefs.flatMap((def) => [
      [def.minFieldId, state[def.minFieldId]],
      [def.maxFieldId, state[def.maxFieldId]],
    ]),
  ) as ConstraintState;
}

function inputState(): SearchInput {
  return {
    ...buildConstraintState(),
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
  return constraintDefs.map(
    (def) =>
      `${def.label} ${formatOptionalNumber(state[def.minFieldId], def.suffix)} 〜 ${formatOptionalNumber(
        state[def.maxFieldId],
        def.suffix,
      )}`,
  );
}

function clearStatusTimeout() {
  if (statusTimeoutId !== null) {
    window.clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
}

function clearStatusMessage() {
  clearStatusTimeout();
  statusMessage = "";
}

function setStatusMessage(message: string, tone: "success" | "error", autoClearMs?: number) {
  clearStatusTimeout();
  statusMessage = message;
  statusTone = tone;

  if (autoClearMs !== undefined) {
    statusTimeoutId = window.setTimeout(() => {
      statusMessage = "";
      statusTimeoutId = null;
      if (activeDataset) {
        refreshView(activeDataset);
      }
    }, autoClearMs);
  }
}

function collectValidationErrors(): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const def of constraintDefs) {
    const minValue = state[def.minFieldId];
    const maxValue = state[def.maxFieldId];
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      const message = `${def.label}下限は${def.label}上限以下にしてください。`;
      errors[def.minFieldId] = message;
      errors[def.maxFieldId] = message;
    }
  }

  return errors;
}

function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

function syncValidationState(showStatusMessage: boolean) {
  validationErrors = collectValidationErrors();

  if (hasValidationErrors(validationErrors)) {
    if (showStatusMessage) {
      setStatusMessage(VALIDATION_STATUS_MESSAGE, "error");
    }
    return;
  }

  if (statusMessage === VALIDATION_STATUS_MESSAGE) {
    clearStatusMessage();
  }
}

function renderNumberField(
  id: NumericFieldId,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number | null,
): string {
  const error = validationErrors[id];
  const describedBy = error ? ` aria-describedby="${id}-error"` : "";
  const invalid = error ? ' aria-invalid="true"' : "";

  return `
    <label class="field-group" for="${id}">
      <span class="field-label">${label}</span>
      <input
        id="${id}"
        name="${id}"
        type="number"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value ?? ""}"${invalid}${describedBy}
      />
      ${error ? `<span class="field-error" id="${id}-error">${escapeHtml(error)}</span>` : ""}
    </label>
  `;
}

function render(dataset: Dataset) {
  const selectableChains = filterSelectableChains(dataset.chains);
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
        <form id="search-form" class="controls-form" novalidate>
          <div class="panel-header">
            <h2>条件設定</h2>
            <button id="copy-share" class="ghost-button" type="button">共有URLをコピー</button>
          </div>
          <p class="section-copy">未入力の項目は制約なしとして扱います。設定後にガチャを回してください。</p>

          <div class="status-region" role="status" aria-live="polite" aria-atomic="true">
            ${
              statusMessage
                ? `<p class="status-message status-${statusTone}">${escapeHtml(statusMessage)}</p>`
                : ""
            }
          </div>

          <div class="form-grid">
            ${constraintDefs
              .flatMap((def) => [
                renderNumberField(
                  def.minFieldId,
                  `${def.label}下限`,
                  def.min,
                  def.max,
                  def.step,
                  state[def.minFieldId],
                ),
                renderNumberField(
                  def.maxFieldId,
                  `${def.label}上限`,
                  def.min,
                  def.max,
                  def.step,
                  state[def.maxFieldId],
                ),
              ])
              .join("")}
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
            <button id="spin-gacha" class="gacha-button" type="submit">
              ${hasAttempted ? "もう一度回す" : "ガチャを回す"}
            </button>
            <p class="action-note">条件一致の候補を最大200件まで探索し、その中から1〜3件をランダム表示します。</p>
          </div>
        </form>

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
  for (const def of constraintDefs) {
    state[def.minFieldId] = parseOptionalValue(document.querySelector<HTMLInputElement>(`#${def.minFieldId}`));
    state[def.maxFieldId] = parseOptionalValue(document.querySelector<HTMLInputElement>(`#${def.maxFieldId}`));
  }
}

function refreshView(dataset: Dataset) {
  activeDataset = dataset;
  state.chains = filterSelectableChainIds(state.chains, dataset.chains);
  writeQueryState(state);
  render(dataset);
}

function runGacha(dataset: Dataset) {
  updateNumericState();
  syncValidationState(true);
  if (hasValidationErrors(validationErrors)) {
    refreshView(dataset);
    return;
  }

  clearStatusMessage();
  lastResponse = searchMenus(dataset.items, inputState());
  latestDraw = drawResults(lastResponse.results);
  drawVersion += 1;
  refreshView(dataset);
}

function bindEvents(dataset: Dataset) {
  document.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateNumericState();
      syncValidationState(false);
      resetDraw();
      refreshView(dataset);
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
      refreshView(dataset);
    });
  });

  document.querySelector<HTMLFormElement>("#search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runGacha(dataset);
  });

  document.querySelector<HTMLButtonElement>("#copy-share")?.addEventListener("click", async () => {
    updateNumericState();
    const text = buildShareUrl(state);
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage("共有URLをコピーしました。", "success", 3000);
    } catch {
      setStatusMessage("共有URLをコピーできませんでした。下の共有URLを直接コピーしてください。", "error", 5000);
    }
    refreshView(dataset);
  });
}

async function main() {
  const response = await fetch("./data/menu-dataset.json");
  if (!response.ok) {
    throw new Error("データセットの読み込みに失敗しました");
  }

  const dataset = (await response.json()) as Dataset;
  const initialState = readQueryState(dataset.chains);
  for (const def of constraintDefs) {
    state[def.minFieldId] = initialState[def.minFieldId];
    state[def.maxFieldId] = initialState[def.maxFieldId];
  }
  state.chains = [...initialState.chains];
  refreshView(dataset);
}

void main();
