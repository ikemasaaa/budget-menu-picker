import type { Chain } from "./types.ts";

type SelectableChain = Pick<Chain, "id" | "status">;

export function filterSelectableChains<T extends SelectableChain>(chains: T[]): T[] {
  return chains.filter((chain) => chain.status === "active");
}

export function filterSelectableChainIds(chainIds: string[], chains: SelectableChain[]): string[] {
  const selectableChainIds = new Set(filterSelectableChains(chains).map((chain) => chain.id));
  return chainIds.filter((chainId) => selectableChainIds.has(chainId));
}
