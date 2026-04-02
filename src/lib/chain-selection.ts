export const HIDDEN_CHAIN_IDS = ["saizeriya", "kurasushi", "hamazushi"] as const;

const HIDDEN_CHAIN_ID_SET = new Set<string>(HIDDEN_CHAIN_IDS);

export function isSelectableChain(chainId: string): boolean {
  return !HIDDEN_CHAIN_ID_SET.has(chainId);
}

export function filterSelectableChains<T extends { id: string }>(chains: T[]): T[] {
  return chains.filter((chain) => isSelectableChain(chain.id));
}

export function filterSelectableChainIds(chainIds: string[]): string[] {
  return chainIds.filter((chainId) => isSelectableChain(chainId));
}
