import type { MenuItem, SearchDiagnostics, SearchInput, SearchResponse, SearchResult } from "./types.ts";

const MAX_REPEAT_PER_ITEM = 1;

type WorkingItem = MenuItem & {
  proteinDensity: number;
};

type Totals = {
  price: number;
  calories: number;
  protein: number;
  quantity: number;
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildKey(items: SearchResult["items"]): string {
  return items
    .map(({ item, quantity }) => `${item.id}x${quantity}`)
    .sort()
    .join("|");
}

function shuffle<T>(values: T[]): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildWorkingItems(items: MenuItem[]): WorkingItem[] {
  return shuffle(items).sort((a, b) => a.price - b.price || b.protein - a.protein).map((item) => ({
    ...item,
    proteinDensity: item.protein / Math.max(item.calories, 1),
  }));
}

function matchesMinimums(totals: Totals, input: SearchInput): boolean {
  if (input.budgetMin !== null && totals.price < input.budgetMin) {
    return false;
  }
  if (input.calorieMin !== null && totals.calories < input.calorieMin) {
    return false;
  }
  if (input.proteinMin !== null && totals.protein < input.proteinMin) {
    return false;
  }
  return true;
}

function exceedsMaximums(totals: Totals, input: SearchInput): boolean {
  if (input.budgetMax !== null && totals.price > input.budgetMax) {
    return true;
  }
  if (input.calorieMax !== null && totals.calories > input.calorieMax) {
    return true;
  }
  if (input.proteinMax !== null && totals.protein > input.proteinMax) {
    return true;
  }
  return totals.quantity > input.maxItemsTotal;
}

function buildSuggestion(items: WorkingItem[], input: SearchInput, baselineCount: number) {
  if (input.budgetMax === null) {
    return null;
  }

  const relaxed = searchMenus(
    items,
    {
      ...input,
      budgetMax: input.budgetMax + 100,
    },
    false,
  );

  if (relaxed.candidateCount <= baselineCount) {
    return null;
  }

  return {
    budgetDelta: 100,
    resultCount: relaxed.candidateCount,
    summary: `予算上限を100円広げると ${relaxed.candidateCount} 件見つかります。`,
  };
}

function explainNoResults(items: WorkingItem[], input: SearchInput): SearchDiagnostics {
  if (input.chainIds.length === 0) {
    return {
      title: "チェーン店が未選択です",
      details: ["少なくとも1チェーンを選ぶとガチャ候補を探索できます。"],
      suggestion: null,
    };
  }

  if (items.length === 0) {
    return {
      title: "単品候補がありません",
      details: ["選択中チェーンに、現在の上限制約を満たす商品がありません。"],
      suggestion: null,
    };
  }

  const details: string[] = [];
  const cheapest = Math.min(...items.map((item) => item.price));
  const lightest = Math.min(...items.map((item) => item.calories));
  const smallestProtein = Math.min(...items.map((item) => item.protein));
  const maxProtein = round(
    [...items]
      .sort((a, b) => b.proteinDensity - a.proteinDensity || b.protein - a.protein)
      .slice(0, input.maxItemsTotal)
      .reduce((sum, item) => sum + item.protein, 0),
  );

  if (input.budgetMax !== null && cheapest > input.budgetMax) {
    details.push(`最安の商品でも ${cheapest}円なので、予算上限 ${input.budgetMax}円では購入できません。`);
  }

  if (input.calorieMax !== null && lightest > input.calorieMax) {
    details.push(`最も低カロリーの商品でも ${lightest}kcal なので、上限 ${input.calorieMax}kcal を超えます。`);
  }

  if (input.proteinMin !== null && maxProtein < input.proteinMin) {
    details.push(`現在の条件で見込めるタンパク質量は最大でも約 ${maxProtein}g です。`);
  }

  if (input.budgetMin !== null) {
    details.push(`予算下限 ${input.budgetMin}円以上になる組み合わせが作れない可能性があります。`);
  }

  if (input.calorieMin !== null) {
    details.push(`カロリー下限 ${input.calorieMin}kcal 以上の組み合わせが作れない可能性があります。`);
  }

  if (input.proteinMax !== null && smallestProtein > input.proteinMax) {
    details.push(`最小のタンパク質量でも ${smallestProtein}g なので、上限 ${input.proteinMax}g を下回れません。`);
  }

  if (details.length === 0) {
    details.push("上下限の組み合わせが厳しく、候補の組み立てができませんでした。");
  }

  return {
    title: "条件に合う組み合わせが見つかりませんでした",
    details,
    suggestion: buildSuggestion(items, input, 0),
  };
}

export function searchMenus(
  allItems: MenuItem[],
  input: SearchInput,
  withDiagnostics = true,
): SearchResponse {
  const eligible = allItems.filter((item) => {
    if (!input.chainIds.includes(item.chainId)) {
      return false;
    }
    if (input.budgetMax !== null && item.price > input.budgetMax) {
      return false;
    }
    if (input.calorieMax !== null && item.calories > input.calorieMax) {
      return false;
    }
    if (input.proteinMax !== null && item.protein > input.proteinMax) {
      return false;
    }
    return true;
  });

  const items = buildWorkingItems(eligible);
  const suffixProtein = new Array<number>(items.length + 1).fill(0);

  for (let index = items.length - 1; index >= 0; index -= 1) {
    suffixProtein[index] = suffixProtein[index + 1] + items[index].protein * MAX_REPEAT_PER_ITEM;
  }

  const candidates: SearchResult[] = [];
  const seenKeys = new Set<string>();
  const chosen: SearchResult["items"] = [];

  function pushResult(totals: Totals) {
    const itemsWithQuantity = chosen.map((entry) => ({ item: entry.item, quantity: entry.quantity }));
    const key = buildKey(itemsWithQuantity);
    if (seenKeys.has(key)) {
      return;
    }

    candidates.push({
      key,
      items: itemsWithQuantity,
      totalPrice: totals.price,
      totalCalories: round(totals.calories),
      totalProtein: round(totals.protein),
      totalQuantity: totals.quantity,
    });
    seenKeys.add(key);
  }

  function dfs(index: number, totals: Totals) {
    if (candidates.length >= input.candidateLimit) {
      return;
    }

    if (exceedsMaximums(totals, input)) {
      return;
    }

    if (input.proteinMin !== null && totals.protein + suffixProtein[index] < input.proteinMin) {
      return;
    }

    if (totals.quantity > 0 && matchesMinimums(totals, input)) {
      pushResult(totals);
    }

    if (index >= items.length || totals.quantity === input.maxItemsTotal) {
      return;
    }

    dfs(index + 1, totals);

    const item = items[index];
    const budgetSlots =
      input.budgetMax === null ? input.maxItemsTotal : Math.floor((input.budgetMax - totals.price) / item.price);
    const calorieSlots =
      input.calorieMax === null
        ? input.maxItemsTotal
        : Math.floor((input.calorieMax - totals.calories) / item.calories);
    const proteinSlots =
      input.proteinMax === null
        ? input.maxItemsTotal
        : Math.floor((input.proteinMax - totals.protein) / item.protein);

    const maxQuantity = Math.min(
      MAX_REPEAT_PER_ITEM,
      input.maxItemsTotal - totals.quantity,
      Math.max(budgetSlots, 0),
      Math.max(calorieSlots, 0),
      Math.max(proteinSlots, 0),
    );

    for (let quantity = 1; quantity <= maxQuantity; quantity += 1) {
      chosen.push({ item, quantity });
      dfs(index + 1, {
        price: totals.price + item.price * quantity,
        calories: totals.calories + item.calories * quantity,
        protein: totals.protein + item.protein * quantity,
        quantity: totals.quantity + quantity,
      });
      chosen.pop();
    }
  }

  dfs(0, { price: 0, calories: 0, protein: 0, quantity: 0 });

  const results = shuffle(candidates);

  return {
    results,
    diagnostics: results.length === 0 && withDiagnostics ? explainNoResults(items, input) : null,
    candidateCount: results.length,
  };
}
