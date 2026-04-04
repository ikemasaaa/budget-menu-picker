import { constraintDefs, type Chain, type ConstraintState, type QueryState } from "./types.ts";
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

export function readQueryState(chains: Chain[]): QueryState {
  const params = new URLSearchParams(window.location.search);
  const selectedChains = filterSelectableChainIds(
    (params.get("chains") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    chains,
  );

  return {
    ...readConstraintState(params),
    chains: selectedChains.length > 0 ? selectedChains : filterSelectableChainIds(DEFAULT_CHAINS, chains),
  };
}

export function writeQueryState(state: QueryState) {
  const params = new URLSearchParams();
  appendConstraintParams(params, state);
  params.set("chains", state.chains.join(","));

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

export function buildShareUrl(state: QueryState): string {
  const url = new URL(window.location.href);
  url.search = "";

  const params = new URLSearchParams();
  appendConstraintParams(params, state);
  params.set("chains", state.chains.join(","));
  url.search = params.toString();

  return url.toString();
}
