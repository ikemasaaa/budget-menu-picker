import { readFile, writeFile } from "node:fs/promises";

import type { Dataset, MenuItem } from "../src/lib/types.ts";
import { normalizeMenuName, type ScrapeOutput } from "./lib/scrape-utils.ts";

const DATASET_PATH = new URL("../data/menu-dataset.json", import.meta.url);
const SCRAPE_FILES = [
  new URL("./scraped/saizeriya.json", import.meta.url),
  new URL("./scraped/kurasushi.json", import.meta.url),
  new URL("./scraped/hamazushi.json", import.meta.url),
];
const TARGET_DATE = "2026-03-31";
const TARGET_SOURCE_LABEL = "公式サイトよりPlaywrightで取得";

function computeTags(item: MenuItem): string[] {
  const tags = new Set<string>();

  if (item.protein >= 20 || item.protein / Math.max(item.price, 1) >= 0.04) {
    tags.add("high-protein");
  }
  if (item.calories <= 250) {
    tags.add("low-calorie");
  }
  if (item.price <= 400) {
    tags.add("value");
  }
  if (tags.size === 0) {
    tags.add("balanced");
  }

  return [...tags];
}

async function readJsonFile<T>(url: URL): Promise<T | null> {
  try {
    const text = await readFile(url, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const dataset = await readJsonFile<Dataset>(DATASET_PATH);
if (!dataset) {
  throw new Error("data/menu-dataset.json を読み込めませんでした。");
}

let anyChainUpdated = false;

for (const file of SCRAPE_FILES) {
  const scrape = await readJsonFile<ScrapeOutput>(file);
  if (!scrape || scrape.items.length === 0) {
    continue;
  }

  const byName = new Map(scrape.items.map((item) => [normalizeMenuName(item.name), item]));
  let updatedCount = 0;

  dataset.items = dataset.items.map((item) => {
    if (item.chainId !== scrape.chainId) {
      return item;
    }

    const scraped = byName.get(normalizeMenuName(item.name));
    if (!scraped) {
      return item;
    }
    if (scraped.price === null || scraped.calories === null || scraped.protein === null) {
      return item;
    }

    updatedCount += 1;
    const nextItem: MenuItem = {
      ...item,
      price: scraped.price,
      calories: scraped.calories,
      protein: scraped.protein,
    };
    nextItem.tags = computeTags(nextItem);
    return nextItem;
  });

  if (updatedCount > 0) {
    anyChainUpdated = true;
    dataset.chains = dataset.chains.map((chain) =>
      chain.id === scrape.chainId
        ? {
            ...chain,
            updatedAt: TARGET_DATE,
            scrapeDate: TARGET_DATE,
            sourceLabel: TARGET_SOURCE_LABEL,
          }
        : chain,
    );
  }
}

if (anyChainUpdated) {
  dataset.metadata = {
    ...dataset.metadata,
    updatedAt: TARGET_DATE,
  };
}

await writeFile(DATASET_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
