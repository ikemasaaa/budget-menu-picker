import type { QueryState } from "./types.ts";
import { filterSelectableChainIds } from "./chain-selection.ts";

const DEFAULT_CHAINS = [
  "yoshinoya",
  "matsuya",
  "mcdonalds",
  "sushiro",
];

function parseOptionalNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function appendNumber(params: URLSearchParams, key: string, value: number | null) {
  if (value !== null) {
    params.set(key, String(value));
  }
}

export function readQueryState(): QueryState {
  const params = new URLSearchParams(window.location.search);
  const chains = filterSelectableChainIds(
    (params.get("chains") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  );

  return {
    budgetMin: parseOptionalNumber(params.get("budgetMin")),
    budgetMax: parseOptionalNumber(params.get("budgetMax")),
    calorieMin: parseOptionalNumber(params.get("calorieMin")),
    calorieMax: parseOptionalNumber(params.get("calorieMax")),
    proteinMin: parseOptionalNumber(params.get("proteinMin")),
    proteinMax: parseOptionalNumber(params.get("proteinMax")),
    chains: chains.length > 0 ? chains : DEFAULT_CHAINS,
  };
}

export function writeQueryState(state: QueryState) {
  const params = new URLSearchParams();
  appendNumber(params, "budgetMin", state.budgetMin);
  appendNumber(params, "budgetMax", state.budgetMax);
  appendNumber(params, "calorieMin", state.calorieMin);
  appendNumber(params, "calorieMax", state.calorieMax);
  appendNumber(params, "proteinMin", state.proteinMin);
  appendNumber(params, "proteinMax", state.proteinMax);
  params.set("chains", state.chains.join(","));

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

export function buildShareUrl(state: QueryState): string {
  const url = new URL(window.location.href);
  url.search = "";

  const params = new URLSearchParams();
  appendNumber(params, "budgetMin", state.budgetMin);
  appendNumber(params, "budgetMax", state.budgetMax);
  appendNumber(params, "calorieMin", state.calorieMin);
  appendNumber(params, "calorieMax", state.calorieMax);
  appendNumber(params, "proteinMin", state.proteinMin);
  appendNumber(params, "proteinMax", state.proteinMax);
  params.set("chains", state.chains.join(","));
  url.search = params.toString();

  return url.toString();
}
