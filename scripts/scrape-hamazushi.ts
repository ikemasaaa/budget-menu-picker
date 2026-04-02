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

const sourceUrl = "https://www.hama-sushi.co.jp/menu/";
const outputPath = new URL("./scraped/hamazushi.json", import.meta.url);

async function extractName(card: Locator): Promise<string> {
  const candidate = await card
    .locator("h1, h2, h3, h4, .title, .name, .menu-name")
    .first()
    .textContent()
    .catch(() => null);

  if (candidate?.trim()) {
    return candidate.trim();
  }

  const fallback = await card.innerText().catch(() => "");
  const firstLine = fallback.split("\n").map((line) => line.trim()).find(Boolean);
  return firstLine ?? "";
}

async function openDetail(card: Locator, page: Page): Promise<{ text: string; url: string | undefined }> {
  const link = card.locator("a").first();
  if (!(await link.count())) {
    return { text: "", url: undefined };
  }

  const previousUrl = page.url();
  await link.click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);

  const detailText = await page.locator("body").innerText().catch(() => "");
  const detailUrl = page.url();

  if (detailUrl !== previousUrl) {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }

  return { text: detailText.replaceAll(/\s+/gu, " ").trim(), url: detailUrl };
}

async function extractCards(page: Page): Promise<ScrapedItem[]> {
  const cards = page.locator("li, article, .menu-list__item, .menu-item, .item");
  const count = await cards.count();
  const items: ScrapedItem[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const summaryText = (await card.innerText().catch(() => "")).replaceAll(/\s+/gu, " ").trim();
    if (!summaryText || !/円|kcal|たんぱく/u.test(summaryText)) {
      continue;
    }

    const name = await extractName(card);
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
    const detail = await openDetail(card, page);
    const nutrition = parseNutritionText(`${summaryText} ${detail.text}`);

    items.push({
      name,
      price: parsePrice(priceText),
      calories: nutrition.calories,
      protein: nutrition.protein,
      rawText: `${summaryText} ${detail.text}`.trim(),
      url: detail.url,
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
    chainId: "hamazushi",
    sourceUrl,
    scrapeDate: "2026-03-31",
    fetchedAt: new Date().toISOString(),
    status: deriveStatus(items, notes),
    notes,
    items,
  });
  await browser.close();
}
