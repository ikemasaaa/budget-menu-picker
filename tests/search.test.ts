import test from "node:test";
import assert from "node:assert/strict";

import { searchMenus } from "../src/lib/search.ts";
import { readQueryState } from "../src/lib/url-state.ts";
import type { MenuItem, SearchInput } from "../src/lib/types.ts";

const items: MenuItem[] = [
  { id: "a", chainId: "alpha", name: "Chicken", category: "main", price: 400, calories: 300, protein: 30, tags: [] },
  { id: "b", chainId: "alpha", name: "Egg", category: "side", price: 120, calories: 80, protein: 7, tags: [] },
  { id: "c", chainId: "beta", name: "Salad", category: "side", price: 150, calories: 40, protein: 2, tags: [] },
  { id: "d", chainId: "beta", name: "Burger", category: "main", price: 320, calories: 420, protein: 14, tags: [] }
];

function baseInput(): SearchInput {
  return {
    budgetMin: 500,
    budgetMax: 700,
    calorieMin: 350,
    calorieMax: 700,
    proteinMin: 35,
    proteinMax: 50,
    chainIds: ["alpha", "beta"],
    maxItemsTotal: 4,
    candidateLimit: 50
  };
}

test("下限と上限制約を同時に満たす候補だけを返す", () => {
  const response = searchMenus(items, baseInput());

  assert.ok(response.results.length > 0);
  assert.ok(response.results.every((result) => result.totalPrice >= 500));
  assert.ok(response.results.every((result) => result.totalPrice <= 700));
  assert.ok(response.results.every((result) => result.totalCalories >= 350));
  assert.ok(response.results.every((result) => result.totalCalories <= 700));
  assert.ok(response.results.every((result) => result.totalProtein >= 35));
  assert.ok(response.results.every((result) => result.totalProtein <= 50));
});

test("同一商品は重複できない", () => {
  const response = searchMenus(items, {
    ...baseInput(),
    budgetMin: 800,
    budgetMax: 1000,
    calorieMin: null,
    calorieMax: 1000,
    proteinMin: 60,
    proteinMax: null
  });

  assert.equal(response.results.length, 0);
  assert.ok(response.diagnostics);
});

test("条件に合うものがない場合は理由を返す", () => {
  const response = searchMenus(items, {
    ...baseInput(),
    budgetMin: 900,
    budgetMax: 950,
    calorieMin: 900,
    calorieMax: 950,
    proteinMin: 80,
    proteinMax: 90
  });

  assert.equal(response.results.length, 0);
  assert.ok(response.diagnostics);
  assert.match(response.diagnostics?.title ?? "", /見つかりません/);
  assert.ok((response.diagnostics?.details.length ?? 0) > 0);
});

test("URLクエリから非表示チェーンを除外する", () => {
  globalThis.window = {
    location: {
      search: "?chains=saizeriya,mcdonalds,hamazushi,sushiro"
    }
  } as Window & typeof globalThis;

  const state = readQueryState();

  assert.deepEqual(state.chains, ["mcdonalds", "sushiro"]);
});

test("チェーン未指定時の既定値に非表示チェーンを含めない", () => {
  globalThis.window = {
    location: {
      search: ""
    }
  } as Window & typeof globalThis;

  const state = readQueryState();

  assert.deepEqual(state.chains, ["yoshinoya", "matsuya", "mcdonalds", "sushiro"]);
});
