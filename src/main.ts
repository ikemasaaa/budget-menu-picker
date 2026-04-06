import { filterSelectableChainIds, filterSelectableChains } from "./lib/chain-selection.ts";
import { searchMenus } from "./lib/search.ts";
import {
  constraintDefs,
  type CategoryGroup,
  type Chain,
  type ConstraintDef,
  type ConstraintState,
  type Dataset,
  type NumericFieldId,
  type NutrientField,
  type NutrientReliability,
  type PriceTier,
  type QueryState,
  type SearchInput,
  type SearchResponse,
  type SearchResult,
} from "./lib/types.ts";
import { readQueryState, writeQueryState } from "./lib/url-state.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app が見つかりません");
}

type AppState = QueryState & {
  priceTierId?: string;
};

type StatusTone = "info" | "success" | "error";
type BoundRole = "min" | "max";

const state: AppState = {
  chainId: "",
  categoryGroupFilter: null,
  priceTierId: undefined,
  budgetMin: null,
  budgetMax: null,
  calorieMin: null,
  calorieMax: null,
  proteinMin: null,
  proteinMax: null,
  carbsMin: null,
  carbsMax: null,
  saltMin: null,
  saltMax: null,
};

const chainBadgePalette: Record<string, string> = {
  yoshinoya: "#111111",
  matsuya: "#333333",
  mcdonalds: "#555555",
  sushiro: "#777777",
  cocoichi: "#222222",
  sukiya: "#666666",
  kurasushi: "#444444",
  hamazushi: "#666666",
};

const nutrientFieldsByConstraint: Partial<Record<ConstraintDef["id"], NutrientField>> = {
  calorie: "calories",
  protein: "protein",
  carbs: "carbs",
  salt: "salt",
};

const categoryGroupPresets: Array<{
  id: string;
  label: string;
  filter: CategoryGroup[] | null;
}> = [
  { id: "all", label: "すべて", filter: null },
  { id: "signature", label: "看板メニュー中心", filter: ["signature"] },
  { id: "signature-side", label: "サイド込み", filter: ["signature", "side"] },
];

let activeDataset: Dataset | null = null;
let lastResponse: SearchResponse | null = null;
let latestDraw: SearchResult[] = [];
let statusMessage = "";
let statusTone: StatusTone = "success";
let isDrawing = false;
let detailedConstraintsOpen = false;
let shouldAnimateLatestResult = false;

const DRAW_DELAY_MS = 400;
const RESULT_FADE_MS = 300;
const ITEM_STAGGER_MS = 100;
const ITEM_FADE_MS = 220;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatYen(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) {
    return date;
  }

  const [, year, month, day] = match;
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

function hasNutrientValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToStep(value: number, step: number): number {
  const precision = step.toString().includes(".") ? step.toString().split(".")[1]?.length ?? 0 : 0;
  return Number((Math.round(value / step) * step).toFixed(precision));
}

function stripNumericFormatting(raw: string): string {
  return raw.replaceAll(",", "").trim();
}

function formatBoundInputValue(value: number | null): string {
  return value === null ? "" : value.toLocaleString("ja-JP");
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = stripNumericFormatting(raw);
  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function clearStatusMessage() {
  statusMessage = "";
}

function setStatusMessage(message: string, tone: StatusTone) {
  statusMessage = message;
  statusTone = tone;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    window.requestAnimationFrame(done);
    window.setTimeout(done, 200);
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buildConstraintState(): ConstraintState {
  return Object.fromEntries(
    constraintDefs.flatMap((def) => [
      [def.minFieldId, state[def.minFieldId]],
      [def.maxFieldId, state[def.maxFieldId]],
    ]),
  ) as ConstraintState;
}

function buildQueryState(): QueryState {
  return {
    ...buildConstraintState(),
    chainId: state.chainId,
    categoryGroupFilter: state.categoryGroupFilter,
  };
}

function eligibleItemsForState(items: Dataset["items"]): Dataset["items"] {
  return items.filter((item) => {
    if (item.chainId !== state.chainId) {
      return false;
    }
    if (state.categoryGroupFilter !== null && !state.categoryGroupFilter.includes(item.categoryGroup)) {
      return false;
    }
    if (state.budgetMax !== null && item.price > state.budgetMax) {
      return false;
    }
    if (state.calorieMax !== null && hasNutrientValue(item.calories) && item.calories > state.calorieMax) {
      return false;
    }
    if (state.proteinMax !== null && hasNutrientValue(item.protein) && item.protein > state.proteinMax) {
      return false;
    }
    if (state.carbsMax !== null && hasNutrientValue(item.carbs) && item.carbs > state.carbsMax) {
      return false;
    }
    if (state.saltMax !== null && hasNutrientValue(item.salt) && item.salt > state.saltMax) {
      return false;
    }
    return true;
  });
}

function medianPrice(items: Dataset["items"]): number | null {
  if (items.length === 0) {
    return null;
  }

  const prices = items.map((item) => item.price).sort((left, right) => left - right);
  const middle = Math.floor(prices.length / 2);
  if (prices.length % 2 === 1) {
    return prices[middle] ?? null;
  }

  const left = prices[middle - 1];
  const right = prices[middle];
  if (left === undefined || right === undefined) {
    return null;
  }
  return (left + right) / 2;
}

function maxItemsTotalForState(items: Dataset["items"]): number {
  if (state.budgetMax === null) {
    return 5;
  }

  const median = medianPrice(eligibleItemsForState(items));
  if (median === null || median <= 0) {
    return 5;
  }

  return clamp(Math.round(state.budgetMax / median), 3, 10);
}

function inputState(items: Dataset["items"]): SearchInput {
  return {
    ...buildConstraintState(),
    chainId: state.chainId,
    categoryGroupFilter: state.categoryGroupFilter,
    maxItemsTotal: maxItemsTotalForState(items),
    candidateLimit: 500,
  };
}

function isSameCategoryGroupFilter(left: CategoryGroup[] | null, right: CategoryGroup[] | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function selectedChain(dataset: Dataset): Chain | null {
  return dataset.chains.find((chain) => chain.id === state.chainId) ?? null;
}

function selectableChains(dataset: Dataset): Chain[] {
  return filterSelectableChains(dataset.chains);
}

function runtimeReliability(chain: Chain | null): Partial<Record<NutrientField, NutrientReliability>> {
  if (!chain) {
    return {};
  }

  return (chain as Chain & {
    nutrientReliability?: Partial<Record<NutrientField, NutrientReliability>>;
  }).nutrientReliability ?? {};
}

function isEstimatedConstraint(chain: Chain | null, def: ConstraintDef): boolean {
  const field = nutrientFieldsByConstraint[def.id];
  if (!field) {
    return false;
  }

  return runtimeReliability(chain)[field] === "estimated";
}

function hasEstimatedNutrients(chain: Chain | null): boolean {
  const reliability = runtimeReliability(chain);
  return Object.values(reliability).some((value) => value === "estimated");
}

function normalizeChainState(dataset: Dataset) {
  const allowedChainIds = filterSelectableChainIds([state.chainId], dataset.chains);
  if (allowedChainIds.length > 0) {
    state.chainId = allowedChainIds[0] ?? "";
    return;
  }

  state.chainId = selectableChains(dataset)[0]?.id ?? "";
}

function chainPriceTiers(chain: Chain | null): PriceTier[] {
  return chain?.priceTiers ?? [];
}

function normalizePriceTierState(dataset: Dataset) {
  const tiers = chainPriceTiers(selectedChain(dataset));
  if (tiers.length === 0) {
    state.priceTierId = undefined;
    return;
  }

  if (!tiers.some((tier) => tier.tierId === state.priceTierId)) {
    state.priceTierId = tiers[0]?.tierId;
  }
}

function readInitialPriceTierId(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const tierId = params.get("tier")?.trim();
  return tierId ? tierId : undefined;
}

function syncUrlState() {
  writeQueryState(buildQueryState());

  const url = new URL(window.location.href);
  if (state.priceTierId) {
    url.searchParams.set("tier", state.priceTierId);
  } else {
    url.searchParams.delete("tier");
  }

  const nextQuery = url.searchParams.toString();
  const nextUrl = nextQuery ? `${url.pathname}?${nextQuery}` : url.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function buildTwitterShareUrl(result: SearchResult, chain: Chain): string {
  const text = `${chain.name}で${formatYen(result.totalPrice)}のメニューガチャ！\n${result.items
    .map((entry) => entry.item.name)
    .join("、")}\n#メニューガチャ`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function resetDraw() {
  lastResponse = null;
  latestDraw = [];
  shouldAnimateLatestResult = false;
  clearStatusMessage();
}

function trackValues(def: ConstraintDef): { min: number; max: number } {
  const minValue = state[def.minFieldId] ?? def.min;
  const maxValue = state[def.maxFieldId] ?? def.max;
  return {
    min: clamp(Math.min(minValue, maxValue), def.min, def.max),
    max: clamp(Math.max(minValue, maxValue), def.min, def.max),
  };
}

function rangePercent(value: number, def: ConstraintDef): number {
  return ((value - def.min) / (def.max - def.min)) * 100;
}

function renderConstraintRow(def: ConstraintDef, chain: Chain | null): string {
  const values = trackValues(def);
  const currentMin = state[def.minFieldId];
  const currentMax = state[def.maxFieldId];

  return `
    <div class="constraint-row" data-constraint-id="${def.id}">
      <div class="constraint-header">
        <label class="constraint-label" for="${def.minFieldId}">${escapeHtml(def.label)}</label>
        ${isEstimatedConstraint(chain, def) ? '<span class="reliability-badge">※推定</span>' : ""}
      </div>
      <div
        class="slider-group"
        data-track-id="${def.id}"
        style="--range-start: ${rangePercent(values.min, def)}%; --range-end: ${rangePercent(values.max, def)}%;"
      >
        <input
          id="${def.minFieldId}"
          class="bound-input"
          type="text"
          inputmode="decimal"
          min="${def.min}"
          max="${def.max}"
          step="${def.step}"
          value="${formatBoundInputValue(currentMin)}"
          data-constraint-id="${def.id}"
          data-role="min"
          ${isDrawing ? "disabled" : ""}
        />
        <div class="range-track">
          <input
            id="${def.id}-range-min"
            class="range-input range-min"
            type="range"
            min="${def.min}"
            max="${values.max}"
            step="${def.step}"
            value="${values.min}"
            data-constraint-id="${def.id}"
            data-role="min"
            aria-label="${escapeHtml(def.label)}下限"
            ${isDrawing ? "disabled" : ""}
          />
          <input
            id="${def.id}-range-max"
            class="range-input range-max"
            type="range"
            min="${values.min}"
            max="${def.max}"
            step="${def.step}"
            value="${values.max}"
            data-constraint-id="${def.id}"
            data-role="max"
            aria-label="${escapeHtml(def.label)}上限"
            ${isDrawing ? "disabled" : ""}
          />
        </div>
        <input
          id="${def.maxFieldId}"
          class="bound-input"
          type="text"
          inputmode="decimal"
          min="${def.min}"
          max="${def.max}"
          step="${def.step}"
          value="${formatBoundInputValue(currentMax)}"
          data-constraint-id="${def.id}"
          data-role="max"
          ${isDrawing ? "disabled" : ""}
        />
        <span class="suffix">${escapeHtml(def.suffix)}</span>
      </div>
    </div>
  `;
}

function chainBadgeColor(chainId: string): string {
  return chainBadgePalette[chainId] ?? "#444444";
}

function renderResult(dataset: Dataset, animateResult: boolean): string {
  const result = latestDraw[0];
  if (!result) {
    return "";
  }

  const chain = selectedChain(dataset);
  const change = state.budgetMax === null ? null : state.budgetMax - result.totalPrice;

  return `
    <div class="result-list">
      <div class="result-header">
        <span class="result-title">あなたのメニュー</span>
        <span class="result-total-price">${formatYen(result.totalPrice)}</span>
      </div>
      <ul class="menu-items">
        ${result.items
          .map((entry) => {
            const itemTotal = entry.item.price * entry.quantity;
            const quantityLabel = entry.quantity > 1 ? ` ×${entry.quantity}` : "";
            return `
              <li class="menu-item${animateResult ? " menu-item-enter" : ""}">
                <span class="chain-badge" style="background: ${chainBadgeColor(entry.item.chainId)}">${escapeHtml(
                  dataset.chains.find((itemChain) => itemChain.id === entry.item.chainId)?.name ?? entry.item.chainId,
                )}</span>
                <span class="item-name">${escapeHtml(entry.item.name)}${quantityLabel}</span>
                <span class="item-price">${formatYen(itemTotal)}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
      <div class="result-summary">
        ${
          change !== null
            ? `
              <div class="change-row">
                <span>おつり</span>
                <span>${formatYen(change)}</span>
              </div>
            `
            : ""
        }
        <div class="nutrients-row">
          ${formatNumber(result.totalCalories)}kcal / ${formatNumber(result.totalProtein)}g protein / ${formatNumber(
            result.totalCarbs,
          )}g carbs / ${formatNumber(result.totalSalt)}g salt
          ${hasEstimatedNutrients(chain) ? '<span class="estimated-note">※一部推定値</span>' : ""}
        </div>
      </div>
      <div class="result-actions">
        <button
          type="button"
          class="action-button btn-retry${isDrawing ? " is-drawing" : ""}"
          id="retry-gacha"
          ${isDrawing ? "disabled" : ""}
        >
          ${isDrawing ? "抽選中..." : "もう一回"}
        </button>
        <button type="button" class="action-button btn-share" id="share-x" ${isDrawing ? "disabled" : ""}>Xでシェア</button>
      </div>
    </div>
  `;
}

function renderResultsSection(dataset: Dataset, animateResult: boolean): string {
  if (latestDraw.length > 0) {
    return renderResult(dataset, animateResult);
  }

  if (lastResponse) {
    return `
      <div class="diagnostics">
        <p class="diagnostics-title">${escapeHtml(lastResponse.diagnostics?.title ?? "候補が見つかりませんでした")}</p>
        <ul class="diagnostics-list">
          ${(lastResponse.diagnostics?.details ?? [])
            .map((detail) => `<li>${escapeHtml(detail)}</li>`)
            .join("")}
        </ul>
        ${
          lastResponse.diagnostics?.suggestion
            ? `<p class="diagnostics-note">${escapeHtml(lastResponse.diagnostics.suggestion.summary)}</p>`
            : ""
        }
      </div>
    `;
  }

  return `
    <div class="idle-message">
      <p>チェーンを選んでガチャを回そう</p>
    </div>
  `;
}

function renderFooter(dataset: Dataset): string {
  return `
    <details>
      <summary>データ出典・免責事項</summary>
      <p class="footer-disclaimer">${escapeHtml(dataset.metadata.disclaimer)}</p>
      <ul class="source-list">
        ${selectableChains(dataset)
          .map(
            (chain) => `
              <li class="source-item">
                <strong>${escapeHtml(chain.name)}</strong>
                <span>${escapeHtml(chain.sourceLabel)}</span>
                <a href="${escapeHtml(chain.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
                  chain.sourceUrl,
                )}</a>
                <span>${escapeHtml(formatDateLabel(chain.scrapeDate))}確認</span>
              </li>
            `,
          )
          .join("")}
      </ul>
    </details>
  `;
}

function renderPriceNote(chain: Chain | null): string {
  if (!chain?.priceNote) {
    return "";
  }

  return `
    <p class="price-note" role="note">⚠ ${escapeHtml(chain.priceNote)}</p>
  `;
}

function render(dataset: Dataset) {
  const chain = selectedChain(dataset);
  const tiers = chainPriceTiers(chain);
  const showTierSelect = tiers.length > 0;
  const animateResult = shouldAnimateLatestResult && latestDraw.length > 0 && !prefersReducedMotion();
  const budgetConstraint = constraintDefs.find((def) => def.id === "budget");
  const detailedConstraintDefs = constraintDefs.filter((def) => def.id !== "budget");

  app.innerHTML = `
    <main class="app">
      <header class="header">
        <h1>メニューガチャ</h1>
        <p class="subtitle">予算内でランダムメニューを組む</p>
      </header>

      <form id="search-form" class="form" novalidate>
        <section class="chain-select">
          <p class="section-label">チェーンを選ぶ</p>
          <div class="chain-pills">
            ${selectableChains(dataset)
              .map(
                (entry) => `
                  <label class="chain-pill">
                    <input
                      type="radio"
                      name="chain"
                      value="${entry.id}"
                      ${entry.id === state.chainId ? "checked" : ""}
                      ${isDrawing ? "disabled" : ""}
                    />
                    <span>${escapeHtml(entry.name)}</span>
                  </label>
                `,
              )
              .join("")}
          </div>
        </section>

        <section class="chain-select">
          <p class="section-label">メニュータイプ</p>
          <div class="chain-pills">
            ${categoryGroupPresets
              .map(
                (preset) => `
                  <label class="chain-pill">
                    <input
                      type="radio"
                      name="menu-type"
                      value="${preset.id}"
                      ${isSameCategoryGroupFilter(preset.filter, state.categoryGroupFilter) ? "checked" : ""}
                      ${isDrawing ? "disabled" : ""}
                    />
                    <span>${escapeHtml(preset.label)}</span>
                  </label>
                `,
              )
              .join("")}
          </div>
        </section>

        <section class="tier-select" ${showTierSelect ? "" : 'style="display: none"'}>
          <label class="section-label" for="price-tier">店舗タイプ</label>
          <select id="price-tier" ${isDrawing ? "disabled" : ""}>
            ${tiers
              .map(
                (tier) => `
                  <option value="${tier.tierId}" ${tier.tierId === state.priceTierId ? "selected" : ""}>
                    ${escapeHtml(tier.label)}
                  </option>
                `,
              )
              .join("")}
          </select>
        </section>

        <section class="constraints">
          ${budgetConstraint ? renderConstraintRow(budgetConstraint, chain) : ""}
          <details class="constraint-details" id="detailed-constraints" ${detailedConstraintsOpen ? "open" : ""}>
            <summary class="constraint-summary">詳細条件（カロリー・栄養）</summary>
            <div class="constraint-details-body">
              ${detailedConstraintDefs.map((def) => renderConstraintRow(def, chain)).join("")}
            </div>
          </details>
        </section>

        ${renderPriceNote(chain)}

        <div class="status-region" role="status" aria-live="polite" aria-atomic="true">
          ${
            statusMessage
              ? `<p class="status-message status-${statusTone}">${escapeHtml(statusMessage)}</p>`
              : `<p class="status-placeholder"></p>`
          }
        </div>

        <div class="gacha-trigger">
          <button type="submit" class="gacha-circle${isDrawing ? " is-drawing" : ""}" ${isDrawing ? "disabled" : ""}>
            ${isDrawing ? "抽選中..." : "ガチャる"}
          </button>
        </div>
      </form>

      <section
        class="results${animateResult ? " results-enter" : ""}"
        aria-busy="${isDrawing ? "true" : "false"}"
        tabindex="-1"
      >
        ${renderResultsSection(dataset, animateResult)}
      </section>

      <footer class="footer">
        ${renderFooter(dataset)}
      </footer>
    </main>
  `;

  bindEvents(dataset);
}

function syncConstraintRow(def: ConstraintDef) {
  const values = trackValues(def);
  const minInput = document.getElementById(def.minFieldId) as HTMLInputElement | null;
  const maxInput = document.getElementById(def.maxFieldId) as HTMLInputElement | null;
  const minRange = document.getElementById(`${def.id}-range-min`) as HTMLInputElement | null;
  const maxRange = document.getElementById(`${def.id}-range-max`) as HTMLInputElement | null;
  const sliderGroup = document.querySelector<HTMLElement>(`.slider-group[data-track-id="${def.id}"]`);

  if (minInput) {
    minInput.value =
      state[def.minFieldId] === null
        ? ""
        : document.activeElement === minInput
          ? String(state[def.minFieldId])
          : formatBoundInputValue(state[def.minFieldId]);
  }

  if (maxInput) {
    maxInput.value =
      state[def.maxFieldId] === null
        ? ""
        : document.activeElement === maxInput
          ? String(state[def.maxFieldId])
          : formatBoundInputValue(state[def.maxFieldId]);
  }

  if (minRange) {
    minRange.max = String(values.max);
    minRange.value = String(values.min);
  }

  if (maxRange) {
    maxRange.min = String(values.min);
    maxRange.value = String(values.max);
  }

  if (sliderGroup) {
    sliderGroup.style.setProperty("--range-start", `${rangePercent(values.min, def)}%`);
    sliderGroup.style.setProperty("--range-end", `${rangePercent(values.max, def)}%`);
  }
}

function updateStateFromNumber(def: ConstraintDef, role: BoundRole, raw: string) {
  const fieldId = role === "min" ? def.minFieldId : def.maxFieldId;
  const otherFieldId = role === "min" ? def.maxFieldId : def.minFieldId;
  const parsed = parseOptionalNumber(raw);

  if (parsed === null) {
    state[fieldId] = null;
    return;
  }

  const normalized = roundToStep(clamp(parsed, def.min, def.max), def.step);
  state[fieldId] = normalized;

  const otherValue = state[otherFieldId];
  if (otherValue === null) {
    return;
  }

  if (role === "min" && normalized > otherValue) {
    state[otherFieldId] = normalized;
  }

  if (role === "max" && normalized < otherValue) {
    state[otherFieldId] = normalized;
  }
}

function updateStateFromRange(def: ConstraintDef, role: BoundRole, raw: string) {
  const value = roundToStep(clamp(Number(raw), def.min, def.max), def.step);
  if (role === "min") {
    const maxValue = state[def.maxFieldId] ?? def.max;
    state[def.minFieldId] = Math.min(value, maxValue);
    return;
  }

  const minValue = state[def.minFieldId] ?? def.min;
  state[def.maxFieldId] = Math.max(value, minValue);
}

function syncAllConstraintRows() {
  for (const def of constraintDefs) {
    syncConstraintRow(def);
  }
}

function syncStateFromBoundInputs() {
  document.querySelectorAll<HTMLInputElement>(".bound-input").forEach((input) => {
    const def = constraintDefs.find((entry) => entry.id === input.dataset.constraintId);
    const role = input.dataset.role as BoundRole | undefined;
    if (!def || !role) {
      return;
    }

    updateStateFromNumber(def, role, input.value);
  });
}

function refreshView(dataset: Dataset) {
  activeDataset = dataset;
  normalizeChainState(dataset);
  normalizePriceTierState(dataset);
  syncUrlState();
  render(dataset);
}

function scrollResultsIntoView() {
  const results = document.querySelector<HTMLElement>(".results");
  if (!results) {
    return;
  }

  results.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
  results.focus({ preventScroll: true });
}

async function revealLatestResult() {
  if (latestDraw.length === 0) {
    scrollResultsIntoView();
    return;
  }

  if (prefersReducedMotion()) {
    scrollResultsIntoView();
    shouldAnimateLatestResult = false;
    return;
  }

  const results = document.querySelector<HTMLElement>(".results");
  if (!results) {
    shouldAnimateLatestResult = false;
    return;
  }

  const menuItems = Array.from(document.querySelectorAll<HTMLElement>(".menu-item-enter"));

  await nextFrame();
  results.classList.add("results-visible");

  menuItems.forEach((item, index) => {
    window.setTimeout(() => {
      item.classList.add("is-visible");
    }, index * ITEM_STAGGER_MS);
  });

  const revealDuration = Math.max(
    RESULT_FADE_MS,
    menuItems.length > 0 ? (menuItems.length - 1) * ITEM_STAGGER_MS + ITEM_FADE_MS : 0,
  );

  await sleep(revealDuration);

  results.classList.remove("results-enter");
  menuItems.forEach((item) => {
    item.classList.remove("menu-item-enter");
    item.classList.add("is-visible");
  });
  shouldAnimateLatestResult = false;
  scrollResultsIntoView();
}

function searchItemsForState(dataset: Dataset): Dataset["items"] {
  const chain = selectedChain(dataset);
  const tier = chainPriceTiers(chain).find((entry) => entry.tierId === state.priceTierId);
  if (!chain || !tier) {
    return dataset.items;
  }

  return dataset.items.map((item) =>
    item.chainId === chain.id
      ? {
          ...item,
          price: Math.round(item.price * tier.priceMultiplier),
        }
      : item,
  );
}

function drawScore(result: SearchResult, budgetMax: number | null): number {
  const budgetUtilization =
    budgetMax === null || budgetMax <= 0 ? 1 : clamp(result.totalPrice / budgetMax, 0, Number.POSITIVE_INFINITY);
  let score = (budgetMax === null ? 1 : budgetUtilization) * Math.max(result.totalQuantity, 1);

  if (result.items.some((entry) => entry.item.categoryGroup === "signature")) {
    score *= 1.3;
  }

  return score;
}

function drawFromScoredPool(
  results: SearchResult[],
  budgetMax: number | null,
): { draw: SearchResult | null; poolSize: number } {
  if (results.length === 0) {
    return { draw: null, poolSize: 0 };
  }

  const scored = [...results]
    .map((result) => ({
      result,
      score: drawScore(result, budgetMax),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.result.totalPrice - left.result.totalPrice ||
        right.result.totalQuantity - left.result.totalQuantity,
    );

  const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.5)));
  const totalWeight = pool.reduce((sum, entry) => sum + Math.max(entry.score, Number.EPSILON), 0);
  let ticket = Math.random() * totalWeight;

  for (const entry of pool) {
    ticket -= Math.max(entry.score, Number.EPSILON);
    if (ticket <= 0) {
      return { draw: entry.result, poolSize: pool.length };
    }
  }

  return {
    draw: pool[pool.length - 1]?.result ?? null,
    poolSize: pool.length,
  };
}

async function runGacha(dataset: Dataset) {
  if (isDrawing) {
    return;
  }

  syncStateFromBoundInputs();
  syncAllConstraintRows();
  normalizePriceTierState(dataset);
  shouldAnimateLatestResult = false;
  isDrawing = true;
  setStatusMessage("抽選中...", "info");
  refreshView(dataset);

  try {
    const drawStartedAt = window.performance.now();
    await nextFrame();

    const items = searchItemsForState(dataset);
    const searchInput = inputState(items);

    lastResponse = searchMenus(items, searchInput);

    const waitTime = prefersReducedMotion() ? 0 : Math.max(DRAW_DELAY_MS - (window.performance.now() - drawStartedAt), 0);
    if (waitTime > 0) {
      await sleep(waitTime);
    }

    const { draw, poolSize } = drawFromScoredPool(lastResponse.results, searchInput.budgetMax);
    latestDraw = draw ? [draw] : [];
    shouldAnimateLatestResult = latestDraw.length > 0;

    if (latestDraw.length > 0) {
      setStatusMessage(
        `結果が出ました。${lastResponse.candidateCount}件の候補から、スコア上位${poolSize}件を重み付きで抽選しました。`,
        "success",
      );
    } else {
      setStatusMessage("結果が出ました。条件に合う候補が見つかりませんでした。", "error");
    }

  } catch {
    setStatusMessage("エラーが発生しました。もう一度お試しください。", "error");
  } finally {
    isDrawing = false;
    refreshView(dataset);
  }

  await revealLatestResult();
}

function bindChainEvents(dataset: Dataset) {
  document.querySelectorAll<HTMLInputElement>('input[name="chain"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.chainId = radio.value;
      normalizePriceTierState(dataset);
      resetDraw();
      refreshView(dataset);
    });
  });
}

function bindCategoryFilterEvents(dataset: Dataset) {
  document.querySelectorAll<HTMLInputElement>('input[name="menu-type"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const preset = categoryGroupPresets.find((entry) => entry.id === radio.value);
      state.categoryGroupFilter = preset?.filter ?? null;
      resetDraw();
      refreshView(dataset);
    });
  });
}

function bindTierEvents(dataset: Dataset) {
  document.getElementById("price-tier")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    state.priceTierId = select.value || undefined;
    resetDraw();
    refreshView(dataset);
  });
}

function bindConstraintDetailsEvents() {
  document.getElementById("detailed-constraints")?.addEventListener("toggle", (event) => {
    detailedConstraintsOpen = (event.currentTarget as HTMLDetailsElement).open;
  });
}

function bindConstraintEvents(dataset: Dataset) {
  document.querySelectorAll<HTMLInputElement>(".bound-input").forEach((input) => {
    input.addEventListener("focus", () => {
      input.value = stripNumericFormatting(input.value);
    });

    input.addEventListener("input", () => {
      const rawValue = stripNumericFormatting(input.value);
      if (input.value !== rawValue) {
        input.value = rawValue;
      }
    });

    input.addEventListener("blur", () => {
      const def = constraintDefs.find((entry) => entry.id === input.dataset.constraintId);
      const role = input.dataset.role as BoundRole | undefined;
      if (!def || !role) {
        return;
      }

      updateStateFromNumber(def, role, input.value);
      syncConstraintRow(def);
    });

    input.addEventListener("change", () => {
      const def = constraintDefs.find((entry) => entry.id === input.dataset.constraintId);
      const role = input.dataset.role as BoundRole | undefined;
      if (!def || !role) {
        return;
      }

      updateStateFromNumber(def, role, input.value);
      syncConstraintRow(def);
      resetDraw();
      refreshView(dataset);
    });
  });

  document.querySelectorAll<HTMLInputElement>(".range-input").forEach((input) => {
    input.addEventListener("input", () => {
      const def = constraintDefs.find((entry) => entry.id === input.dataset.constraintId);
      const role = input.dataset.role as BoundRole | undefined;
      if (!def || !role) {
        return;
      }

      updateStateFromRange(def, role, input.value);
      clearStatusMessage();
      syncConstraintRow(def);
      syncUrlState();
    });

    input.addEventListener("change", () => {
      resetDraw();
      refreshView(dataset);
    });
  });
}

function bindResultEvents(dataset: Dataset) {
  document.getElementById("retry-gacha")?.addEventListener("click", () => {
    void runGacha(dataset);
  });

  document.getElementById("share-x")?.addEventListener("click", () => {
    const result = latestDraw[0];
    const chain = selectedChain(dataset);
    if (!result || !chain) {
      return;
    }

    window.open(buildTwitterShareUrl(result, chain), "_blank");
  });
}

function bindEvents(dataset: Dataset) {
  bindChainEvents(dataset);
  bindCategoryFilterEvents(dataset);
  bindTierEvents(dataset);
  bindConstraintDetailsEvents();
  bindConstraintEvents(dataset);
  bindResultEvents(dataset);

  document.getElementById("search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runGacha(dataset);
  });

  syncAllConstraintRows();
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

  state.chainId = initialState.chainId;
  state.categoryGroupFilter = initialState.categoryGroupFilter;
  state.priceTierId = readInitialPriceTierId();

  refreshView(dataset);
}

void main();
