import { chromium } from "playwright";
import type { Locator, Page } from "playwright";

import {
  deriveStatus,
  normalizeMenuName,
  parseNutritionText,
  parsePrice,
  saveScrapeOutput,
  type ScrapedItem,
} from "./lib/scrape-utils.ts";

const sourceUrl = "https://www.kurasushi.co.jp/menu/";
const outputPath = new URL("./scraped/kurasushi.json", import.meta.url);

async function cardText(card: Locator): Promise<string> {
  const text = await card.innerText().catch(() => "");
  return text.replaceAll(/\s+/gu, " ").trim();
}

async function tryOpenDetail(card: Locator, page: Page): Promise<string> {
  const beforeUrl = page.url();
  const link = card.locator("a").first();
  if (!(await link.count())) {
    return "";
  }

  await link.click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  const detailText = await page.locator("body").innerText().catch(() => "");

  if (page.url() !== beforeUrl) {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }

  return detailText.replaceAll(/\s+/gu, " ").trim();
}

async function extractCards(page: Page): Promise<ScrapedItem[]> {
  const cards = page.locator("li, article, .menuList__item, .menu-item, .item");
  const count = await cards.count();
  const items: ScrapedItem[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const summaryText = await cardText(card);
    if (!summaryText || !/円|kcal|たんぱく/u.test(summaryText)) {
      continue;
    }

    const name =
      (await card.locator("h1, h2, h3, h4, .title, .name").first().textContent().catch(() => null))?.trim() ??
      summaryText.split(" ").find((part) => !/円|kcal|たんぱく/u.test(part)) ??
      "";

    if (!name) {
      continue;
    }

    const normalized = normalizeMenuName(name);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const priceText =
      (await card.locator("text=/\\d+\\s*円/u").first().textContent().catch(() => null)) ?? summaryText;
    const detailText = await tryOpenDetail(card, page);
    const nutrition = parseNutritionText(`${summaryText} ${detailText}`);

    items.push({
      name,
      price: parsePrice(priceText),
      calories: nutrition.calories,
      protein: nutrition.protein,
      rawText: `${summaryText} ${detailText}`.trim(),
      url: page.url(),
    });
  }

  return items;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const notes: string[] = [];
let items: ScrapedItem[] = [];

try {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForSelector("body", { timeout: 30_000 });
  items = await extractCards(page);

  if (items.length === 0) {
    notes.push("メニュー一覧/詳細から価格・栄養テキストを含むカードを抽出できませんでした。");
  }
} catch (error) {
  notes.push(error instanceof Error ? error.message : String(error));
} finally {
  await saveScrapeOutput(outputPath.pathname, {
    chainId: "kurasushi",
    sourceUrl,
    scrapeDate: "2026-03-31",
    fetchedAt: new Date().toISOString(),
    status: deriveStatus(items, notes),
    notes,
    items,
  });
  await browser.close();
}
