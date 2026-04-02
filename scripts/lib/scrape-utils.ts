import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ScrapedItem = {
  name: string;
  price: number | null;
  calories: number | null;
  protein: number | null;
  category?: string;
  url?: string;
  rawText?: string;
};

export type ScrapeOutput = {
  chainId: string;
  sourceUrl: string;
  scrapeDate: string;
  fetchedAt: string;
  status: "success" | "partial" | "failed";
  notes: string[];
  items: ScrapedItem[];
};

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/u;

export function normalizeMenuName(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll(/\s+/gu, "")
    .replaceAll(/[()（）【】\[\]・.,]/gu, "")
    .trim()
    .toLowerCase();
}

export function parseNumber(value: string): number | null {
  const match = value.match(NUMBER_PATTERN);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePrice(value: string): number | null {
  const sanitized = value.replaceAll(",", "");
  return parseNumber(sanitized);
}

export function parseNutritionText(text: string): { calories: number | null; protein: number | null } {
  const normalized = text.normalize("NFKC");
  const calorieMatch = normalized.match(/(?:熱量|エネルギー|カロリー)[^0-9]{0,8}(\d+(?:\.\d+)?)\s*(?:k?cal|kJ)?/iu);
  const proteinMatch = normalized.match(/(?:たんぱく質|タンパク質)[^0-9]{0,8}(\d+(?:\.\d+)?)\s*g?/iu);

  return {
    calories: calorieMatch ? Number.parseFloat(calorieMatch[1]) : null,
    protein: proteinMatch ? Number.parseFloat(proteinMatch[1]) : null,
  };
}

export async function saveScrapeOutput(path: string, output: ScrapeOutput): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

export function deriveStatus(items: ScrapedItem[], notes: string[]): ScrapeOutput["status"] {
  if (items.length === 0) {
    return "failed";
  }

  const completeCount = items.filter(
    (item) => item.price !== null && item.calories !== null && item.protein !== null,
  ).length;

  if (completeCount === items.length && notes.length === 0) {
    return "success";
  }

  return "partial";
}
