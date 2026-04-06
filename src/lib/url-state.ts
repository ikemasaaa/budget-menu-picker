import { constraintDefs, type CategoryGroup, type Chain, type ConstraintState, type QueryState } from "./types.ts";
import { filterSelectableChainIds } from "./chain-selection.ts";

export const DEFAULT_CHAIN_ID = "yoshinoya";
const CATEGORY_GROUPS: CategoryGroup[] = ["signature", "side", "dessert", "drink"];

function parseOptionalNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const parsed = Number(raw.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function appendNumber(params: URLSearchParams, key: string, value: number | null) {
  if (value !== null) {
    params.set(key, String(value));
  }
}

function readConstraintState(params: URLSearchParams): ConstraintState {
  return Object.fromEntries(
    constraintDefs.flatMap((def) => [
      [def.minFieldId, parseOptionalNumber(params.get(def.minFieldId))],
      [def.maxFieldId, parseOptionalNumber(params.get(def.maxFieldId))],
    ]),
  ) as ConstraintState;
}

function appendConstraintParams(params: URLSearchParams, state: ConstraintState) {
  for (const def of constraintDefs) {
    appendNumber(params, def.minFieldId, state[def.minFieldId]);
    appendNumber(params, def.maxFieldId, state[def.maxFieldId]);
  }
}

function readCategoryGroupFilter(params: URLSearchParams): CategoryGroup[] | null {
  const raw = params.get("categoryFilter");
  if (!raw) {
    return null;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is CategoryGroup => CATEGORY_GROUPS.includes(value as CategoryGroup));

  return values.length > 0 ? values : null;
}

function appendCategoryGroupFilter(params: URLSearchParams, filter: CategoryGroup[] | null) {
  if (filter === null) {
    return;
  }

  params.set("categoryFilter", filter.join(","));
}

export function readQueryState(chains: Chain[]): QueryState {
  const params = new URLSearchParams(window.location.search);
  const selectedChainId = filterSelectableChainIds([params.get("chain") ?? ""], chains)[0];
  const fallbackChainId = filterSelectableChainIds([DEFAULT_CHAIN_ID], chains)[0]
    ?? filterSelectableChainIds(chains.map((chain) => chain.id), chains)[0]
    ?? "";

  return {
    ...readConstraintState(params),
    chainId: selectedChainId ?? fallbackChainId,
    categoryGroupFilter: readCategoryGroupFilter(params),
  };
}

export function writeQueryState(state: QueryState) {
  const params = new URLSearchParams();
  appendConstraintParams(params, state);
  appendCategoryGroupFilter(params, state.categoryGroupFilter);
  if (state.chainId) {
    params.set("chain", state.chainId);
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

export function buildShareUrl(state: QueryState): string {
  const url = new URL(window.location.href);
  url.search = "";

  const params = new URLSearchParams();
  appendConstraintParams(params, state);
  appendCategoryGroupFilter(params, state.categoryGroupFilter);
  if (state.chainId) {
    params.set("chain", state.chainId);
  }
  url.search = params.toString();

  return url.toString();
}
