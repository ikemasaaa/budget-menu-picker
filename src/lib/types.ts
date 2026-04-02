export type Chain = {
  id: string;
  name: string;
  updatedAt: string;
  scrapeDate: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type MenuItem = {
  id: string;
  chainId: string;
  name: string;
  category: string;
  price: number;
  calories: number;
  protein: number;
  tags: string[];
};

export type Dataset = {
  metadata: {
    title: string;
    description: string;
    updatedAt: string;
    disclaimer: string;
  };
  chains: Chain[];
  items: MenuItem[];
};

export type SearchInput = {
  budgetMin: number | null;
  budgetMax: number | null;
  calorieMin: number | null;
  calorieMax: number | null;
  proteinMin: number | null;
  proteinMax: number | null;
  chainIds: string[];
  maxItemsTotal: number;
  candidateLimit: number;
};

export type ResultItem = {
  item: MenuItem;
  quantity: number;
};

export type SearchResult = {
  key: string;
  items: ResultItem[];
  totalPrice: number;
  totalCalories: number;
  totalProtein: number;
  totalQuantity: number;
};

export type SearchSuggestion = {
  budgetDelta: number;
  resultCount: number;
  summary: string;
};

export type SearchDiagnostics = {
  title: string;
  details: string[];
  suggestion: SearchSuggestion | null;
};

export type SearchResponse = {
  results: SearchResult[];
  diagnostics: SearchDiagnostics | null;
  candidateCount: number;
};

export type QueryState = {
  budgetMin: number | null;
  budgetMax: number | null;
  calorieMin: number | null;
  calorieMax: number | null;
  proteinMin: number | null;
  proteinMax: number | null;
  chains: string[];
};
