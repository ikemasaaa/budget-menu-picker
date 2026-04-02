import { chromium } from "playwright";
import type { Page } from "playwright";

import {
  deriveStatus,
  parseNutritionText,
  parsePrice,
  saveScrapeOutput,
  type ScrapedItem,
} from "./lib/scrape-utils.ts";

const sourceUrl = "https://www.saizeriya.co.jp/nutrition/";
const outputPath = new URL("./scraped/saizeriya.json", import.meta.url);

async function extractRows(page: Page): Promise<ScrapedItem[]> {
  const rows = await page.locator("table tr").elementHandles();
  const items: ScrapedItem[] = [];

  for (const row of rows) {
    const cells = await row.locator("th, td").allInnerTexts();
    if (cells.length < 2) {
      continue;
    }

    const joined = cells.join(" ").replaceAll(/\s+/gu, " ").trim();
    const name = cells[0]?.trim();
    if (!name || /メニュー|商品|品名/u.test(name)) {
      continue;
    }

    const nutrition = parseNutritionText(joined);
    const priceCandidate = cells.find((cell) => /円/u.test(cell)) ?? joined;

    items.push({
      name,
      price: parsePrice(priceCandidate),
      calories: nutrition.calories,
      protein: nutrition.protein,
      rawText: joined,
    });
  }

  return items;
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const candidates = [
    page.getByRole("button", { name: /同意|承諾|許可|閉じる/u }),
    page.locator("[aria-label*='close' i], .close, .button-close").first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => undefined);
      return;
    }
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const notes: string[] = [];
let items: ScrapedItem[] = [];

try {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await dismissCookieBanner(page);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForSelector("table", { timeout: 30_000 });
  items = await extractRows(page);

  if (items.length === 0) {
    notes.push("nutrition ページ上の table から商品行を抽出できませんでした。");
  }
} catch (error) {
  notes.push(error instanceof Error ? error.message : String(error));
} finally {
  await saveScrapeOutput(outputPath.pathname, {
    chainId: "saizeriya",
    sourceUrl,
    scrapeDate: "2026-03-31",
    fetchedAt: new Date().toISOString(),
    status: deriveStatus(items, notes),
    notes,
    items,
  });
  await browser.close();
}
