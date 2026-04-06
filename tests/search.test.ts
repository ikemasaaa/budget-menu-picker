import test from "node:test";
import assert from "node:assert/strict";

import { searchMenus } from "../src/lib/search.ts";
import { DEFAULT_CHAIN_ID, readQueryState } from "../src/lib/url-state.ts";
import type { Chain, MenuItem, SearchInput } from "../src/lib/types.ts";

const items: MenuItem[] = [
  { id: "a", chainId: "alpha", name: "Chicken", category: "main", categoryGroup: "signature", price: 400, calories: 300, protein: 30, carbs: 10, salt: 1.2, tags: [] },
  { id: "b", chainId: "alpha", name: "Egg", category: "side", categoryGroup: "side", price: 120, calories: 80, protein: 7, carbs: 1, salt: 0.3, tags: [] },
  { id: "c", chainId: "beta", name: "Salad", category: "side", categoryGroup: "side", price: 150, calories: 40, protein: 2, carbs: 5, salt: 0.5, tags: [] },
  { id: "d", chainId: "beta", name: "Burger", category: "main", categoryGroup: "signature", price: 320, calories: 420, protein: 14, carbs: 35, salt: 2.1, tags: [] }
];

function chain(id: string, status: Chain["status"]): Chain {
  return {
    id,
    name: id,
    status,
    updatedAt: "2026-03-31",
    scrapeDate: "2026-03-31",
    sourceLabel: "test",
    sourceUrl: "https://example.com",
    nutrientReliability: {
      calories: "official",
      protein: "official",
      carbs: "estimated",
      salt: "estimated",
    },
  };
}

const testChains: Chain[] = [
  chain("saizeriya", "pending"),
  chain("yoshinoya", "active"),
  chain("matsuya", "active"),
  chain("mcdonalds", "active"),
  chain("sushiro", "active"),
  chain("hamazushi", "pending")
];

function baseInput(): SearchInput {
  return {
    budgetMin: 500,
    budgetMax: 700,
    calorieMin: 350,
    calorieMax: 700,
    proteinMin: 35,
    proteinMax: 50,
    carbsMin: null,
    carbsMax: null,
    saltMin: null,
    saltMax: null,
    chainId: "alpha",
    categoryGroupFilter: null,
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
  assert.ok(response.results.every((result) => result.totalCarbs >= 0));
  assert.ok(response.results.every((result) => result.totalSalt >= 0));
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

test("null の栄養素は制約判定をスキップする", () => {
  const response = searchMenus(
    [
      { id: "x", chainId: "gamma", name: "Unknown", category: "main", categoryGroup: "signature", price: 200, calories: 100, protein: 10, carbs: null, salt: null, tags: [] },
    ],
    {
      budgetMin: null,
      budgetMax: 300,
      calorieMin: null,
      calorieMax: 200,
      proteinMin: null,
      proteinMax: 20,
      carbsMin: null,
      carbsMax: 1,
      saltMin: null,
      saltMax: 0.1,
      chainId: "gamma",
      categoryGroupFilter: null,
      maxItemsTotal: 1,
      candidateLimit: 10,
    },
  );

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]?.totalCarbs, 0);
  assert.equal(response.results[0]?.totalSalt, 0);
});

test("undefined の栄養素でも探索が止まらない", () => {
  const response = searchMenus(
    [
      { id: "x", chainId: "gamma", name: "Unknown", category: "main", categoryGroup: "signature", price: 200, calories: 100, protein: 10, carbs: undefined, salt: undefined, tags: [] },
    ],
    {
      budgetMin: null,
      budgetMax: 300,
      calorieMin: null,
      calorieMax: 200,
      proteinMin: null,
      proteinMax: 20,
      carbsMin: null,
      carbsMax: 1,
      saltMin: null,
      saltMax: 0.1,
      chainId: "gamma",
      categoryGroupFilter: null,
      maxItemsTotal: 1,
      candidateLimit: 10,
    },
  );

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]?.totalCarbs, 0);
  assert.equal(response.results[0]?.totalSalt, 0);
});

test("categoryGroupFilter で看板メニューだけに絞れる", () => {
  const response = searchMenus(items, {
    ...baseInput(),
    budgetMin: null,
    budgetMax: 450,
    calorieMin: null,
    calorieMax: 400,
    proteinMin: null,
    proteinMax: null,
    categoryGroupFilter: ["signature"],
    maxItemsTotal: 2,
  });

  assert.ok(response.results.length > 0);
  assert.ok(response.results.every((result) => result.items.every((entry) => entry.item.categoryGroup === "signature")));
});

test("URLクエリから非表示チェーンを除外する", () => {
  globalThis.window = {
    location: {
      search: "?chain=mcdonalds"
    }
  } as Window & typeof globalThis;

  const state = readQueryState(testChains);

  assert.equal(state.chainId, "mcdonalds");
});

test("チェーン未指定時の既定値に非表示チェーンを含めない", () => {
  globalThis.window = {
    location: {
      search: ""
    }
  } as Window & typeof globalThis;

  const state = readQueryState(testChains);

  assert.equal(state.chainId, DEFAULT_CHAIN_ID);
});

test("URLクエリの数値はカンマ付きでも読める", () => {
  globalThis.window = {
    location: {
      search: "?chain=yoshinoya&budgetMax=1,000&proteinMin=35"
    }
  } as Window & typeof globalThis;

  const state = readQueryState(testChains);

  assert.equal(state.chainId, "yoshinoya");
  assert.equal(state.budgetMax, 1000);
  assert.equal(state.proteinMin, 35);
});
