export type ChainStatus = "active" | "hidden" | "pending";

export type NutrientField = "calories" | "protein" | "carbs" | "salt";

export type NutrientReliability = "official" | "estimated";

export type CategoryGroup = "signature" | "side" | "dessert" | "drink";

export type PriceTier = {
  tierId: string;
  label: string;
  priceMultiplier: number;
};

export type Chain = {
  id: string;
  name: string;
  status: ChainStatus;
  updatedAt: string;
  scrapeDate: string;
  sourceLabel: string;
  sourceUrl: string;
  nutrientReliability: Record<NutrientField, NutrientReliability>;
  priceNote?: string;
  priceTiers?: PriceTier[];
};

export type MenuItem = {
  id: string;
  chainId: string;
  name: string;
  category: string;
  categoryGroup: CategoryGroup;
  price: number;
  calories: number | null | undefined;
  protein: number | null | undefined;
  carbs: number | null | undefined;
  salt: number | null | undefined;
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

export type ConstraintId = "budget" | "calorie" | "protein" | "carbs" | "salt";

export type NumericFieldId = `${ConstraintId}${"Min" | "Max"}`;

export type ConstraintState = Record<NumericFieldId, number | null>;

export type ConstraintDef = {
  id: ConstraintId;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  minFieldId: `${ConstraintId}Min`;
  maxFieldId: `${ConstraintId}Max`;
};

export const constraintDefs = [
  {
    id: "budget",
    label: "予算",
    min: 0,
    max: 5000,
    step: 50,
    suffix: "円",
    minFieldId: "budgetMin",
    maxFieldId: "budgetMax",
  },
  {
    id: "calorie",
    label: "カロリー",
    min: 0,
    max: 3000,
    step: 50,
    suffix: "kcal",
    minFieldId: "calorieMin",
    maxFieldId: "calorieMax",
  },
  {
    id: "protein",
    label: "タンパク質",
    min: 0,
    max: 200,
    step: 1,
    suffix: "g",
    minFieldId: "proteinMin",
    maxFieldId: "proteinMax",
  },
  {
    id: "carbs",
    label: "炭水化物",
    min: 0,
    max: 500,
    step: 5,
    suffix: "g",
    minFieldId: "carbsMin",
    maxFieldId: "carbsMax",
  },
  {
    id: "salt",
    label: "塩分",
    min: 0,
    max: 20,
    step: 0.1,
    suffix: "g",
    minFieldId: "saltMin",
    maxFieldId: "saltMax",
  },
] as const satisfies readonly ConstraintDef[];

export type SearchInput = ConstraintState & {
  chainId: string;
  categoryGroupFilter: CategoryGroup[] | null;
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
  totalCarbs: number;
  totalSalt: number;
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

export type QueryState = ConstraintState & {
  chainId: string;
  categoryGroupFilter: CategoryGroup[] | null;
};
