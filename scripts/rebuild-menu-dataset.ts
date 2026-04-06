import { readFile, writeFile } from "node:fs/promises";

type ChainRecord = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  scrapeDate: string;
  sourceLabel: string;
  sourceUrl: string;
  nutrientReliability?: Record<string, string>;
  priceTiers?: Array<{
    tierId: string;
    label: string;
    priceMultiplier: number;
  }>;
};

type ItemRecord = {
  id: string;
  chainId: string;
  name: string;
  category: string;
  categoryGroup: "signature" | "side";
  price: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  salt: number | null;
  tags: string[];
};

type Dataset = {
  metadata: {
    title: string;
    description: string;
    updatedAt: string;
    disclaimer: string;
  };
  chains: ChainRecord[];
  items: ItemRecord[];
};

type PriceEntry = {
  rawName: string;
  displayName: string;
  price: number;
  section: string;
};

type NutritionRow = {
  name: string | null;
  size: string | null;
  calories: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  salt: number | null;
};

type HamazushiScrapedEntry = {
  name: string;
  price: number;
  rawCategory: string;
  category: string;
};

const DATASET_PATH = new URL("../data/menu-dataset.json", import.meta.url);
const HAMAZUSHI_SCRAPED_PATH = new URL("../data/hamazushi-scraped.tsv", import.meta.url);
const TARGET_DATE = "2026-04-06";
const ACTIVE_CHAIN_IDS = new Set([
  "yoshinoya",
  "matsuya",
  "mcdonalds",
  "sushiro",
  "kurasushi",
  "hamazushi",
  "cocoichi",
  "sukiya",
]);

const CHAIN_ORDER = [
  "saizeriya",
  "yoshinoya",
  "matsuya",
  "mcdonalds",
  "sushiro",
  "kurasushi",
  "hamazushi",
  "cocoichi",
  "sukiya",
] as const;

const CHAIN_PREFIX: Record<string, string> = {
  saizeriya: "s",
  yoshinoya: "y",
  matsuya: "m",
  mcdonalds: "mc",
  sushiro: "su",
  kurasushi: "ku",
  hamazushi: "hz",
  cocoichi: "co",
  sukiya: "sk",
};

const RELIABILITY: Record<string, Record<string, string>> = {
  saizeriya: { calories: "estimated", protein: "estimated", carbs: "estimated", salt: "estimated" },
  yoshinoya: { calories: "official", protein: "official", carbs: "official", salt: "official" },
  matsuya: { calories: "official", protein: "official", carbs: "official", salt: "official" },
  mcdonalds: { calories: "official", protein: "official", carbs: "official", salt: "official" },
  sushiro: { calories: "official", protein: "estimated", carbs: "estimated", salt: "estimated" },
  kurasushi: { calories: "official", protein: "estimated", carbs: "estimated", salt: "estimated" },
  hamazushi: { calories: "official", protein: "estimated", carbs: "estimated", salt: "estimated" },
  cocoichi: { calories: "official", protein: "official", carbs: "official", salt: "official" },
  sukiya: { calories: "estimated", protein: "estimated", carbs: "estimated", salt: "estimated" },
};

const YOSHINOYA_SIZE_ORDER = ["小盛", "並盛", "アタマの大盛", "大盛", "特盛", "超特盛"] as const;
const MATSUYA_SIZE_ORDER = ["小盛", "並盛", "あたま大盛", "大盛", "特盛"] as const;
const SUKIYA_SIZE_ORDER = ["ミニ", "並盛", "中盛", "大盛", "特盛", "メガ"] as const;
const SIZE_TOKENS = [...YOSHINOYA_SIZE_ORDER, ...MATSUYA_SIZE_ORDER, ...SUKIYA_SIZE_ORDER] as const;
const YOSHINOYA_SIZE_PRICE_ADJUSTMENTS: Record<(typeof YOSHINOYA_SIZE_ORDER)[number], number> = {
  小盛: -33,
  並盛: 0,
  アタマの大盛: 176,
  大盛: 242,
  特盛: 440,
  超特盛: 561,
};
const MATSUYA_SIZE_PRICE_ADJUSTMENTS: Record<(typeof MATSUYA_SIZE_ORDER)[number], number> = {
  小盛: -30,
  並盛: 0,
  あたま大盛: 170,
  大盛: 220,
  特盛: 400,
};
const SUKIYA_SIZE_PRICE_ADJUSTMENTS: Record<(typeof SUKIYA_SIZE_ORDER)[number], number> = {
  ミニ: -50,
  並盛: 0,
  中盛: 170,
  大盛: 200,
  特盛: 400,
  メガ: 550,
};
const SUKIYA_SIZE_NUTRITION_MULTIPLIERS: Record<(typeof SUKIYA_SIZE_ORDER)[number], number> = {
  ミニ: 0.67,
  並盛: 1.0,
  中盛: 1.25,
  大盛: 1.35,
  特盛: 1.7,
  メガ: 2.15,
};
const REGION_TAG_PATTERN = /^[\(（][^()（）]*(?:限定|以外|エリア|対象|沖縄)[^()（）]*[\)）]\s*/;
const ROW_NUMERIC_PATTERN =
  /^(.*?)\s+(\d{1,3}(?:,\d{3})?)\s+(\d+\.\d|※)\s+(\d+\.\d|※)\s+(\d+\.\d|※)\s+(\d+\.\d|※)\b/;

const YOSHINOYA_ALIASES: Record<string, string[]> = {
  "焦がしねぎ焼き鳥丼": ["焦がしネギ焼き鳥丼"],
  "塩さば（単品）": ["塩さば"],
  "鮭（単品）": ["鮭"],
  "から揚げ（単品1個）": ["から揚げ"],
  "焼魚定食": ["焼魚定食（鮭）"],
  "特朝定食": ["特朝定食（鮭）"],
  "塩さば定食": ["塩さば定食"],
  "塩さば特朝定食": ["塩さば特朝定食"],
};

const YOSHINOYA_COMPOSITION_RECIPES: Record<string, Array<{ name: string; quantity?: number }>> = {
  肉だく牛丼: [{ name: "牛丼" }, { name: "肉だく（牛小鉢）" }],
  鬼おろしポン酢牛丼: [{ name: "牛丼" }, { name: "鬼おろしポン酢（単品）" }],
  ねぎだく牛丼: [{ name: "牛丼" }, { name: "ねぎだく" }],
  ねぎ玉牛丼: [{ name: "牛丼" }, { name: "ねぎ玉子" }],
  チーズ牛丼: [{ name: "牛丼" }, { name: "チーズ" }],
  キムチ牛丼: [{ name: "牛丼" }, { name: "キムチ" }],
  ねぎラー油牛丼: [{ name: "牛丼" }, { name: "ねぎラー油" }],
  チーズ豚丼: [{ name: "豚丼" }, { name: "チーズ" }],
  キムチ豚丼: [{ name: "豚丼" }, { name: "キムチ" }],
  キムチ牛カルビ丼: [{ name: "牛カルビ丼" }, { name: "キムチ" }],
  チーズ牛カルビ丼: [{ name: "牛カルビ丼" }, { name: "チーズ" }],
  ハニーマスタードから揚げ丼: [{ name: "から揚げ丼" }, { name: "ハニーマスタードソース" }],
  鬼おろしポン酢から揚げ丼: [{ name: "から揚げ丼" }, { name: "鬼おろしポン酢（単品）" }],
  チーズ黒カレー: [{ name: "黒カレー" }, { name: "チーズ" }],
  牛黒カレー: [{ name: "黒カレー" }, { name: "肉だく（牛小鉢）" }],
  肉だく牛黒カレー: [{ name: "黒カレー" }, { name: "牛皿" }],
  牛オム黒カレー: [{ name: "黒カレー" }, { name: "牛皿" }, { name: "オム玉子" }],
  から揚げ黒カレー: [{ name: "黒カレー" }, { name: "から揚げ（単品1個）", quantity: 2 }],
  鬼おろしポン酢から揚げ定食: [{ name: "から揚げ定食" }, { name: "鬼おろしポン酢（単品）" }],
  ハニーマスタードから揚げ定食: [{ name: "から揚げ定食" }, { name: "ハニーマスタードソース" }],
  タルタル南蛮から揚げ定食: [{ name: "から揚げ定食" }, { name: "タルタルソース" }],
};

const MCDONALDS_PRICE_OVERRIDES: Record<string, number> = {
  ハンバーガー: 190,
  チーズバーガー: 220,
  ダブルチーズバーガー: 450,
  ビッグマック: 480,
  てりやきマックバーガー: 400,
  チキンフィレオ: 420,
  えびフィレオ: 410,
  フィレオフィッシュ: 410,
  マックチキン: 190,
  チキチー: 250,
  マックポーク: 280,
  ベーコンレタスバーガー: 400,
  エグチ: 290,
  エッグマックマフィン: 260,
  ソーセージマフィン: 210,
  ソーセージエッグマフィン: 330,
  チキンマックマフィン: 330,
  "マックグリドル ソーセージ": 270,
  "マックグリドル ベーコンエッグ": 310,
  ホットケーキ: 330,
  ハッシュポテト: 150,
  "チキンマックナゲット 5ピース": 290,
  "マックフライポテト M": 330,
  "マックフライポテト S": 200,
  ソフトツイスト: 170,
  ホットアップルパイ: 160,
  "マックフルーリー オレオ クッキー": 340,
  えだまめコーン: 290,
  サイドサラダ: 310,
  プチパンケーキ: 210,
  "マックシェイク バニラ M": 230,
  "マックシェイク チョコレート M": 230,
};

const MCDONALDS_PDF_PATTERNS: Array<{ pdfLabel: string; itemName: string }> = [
  { pdfLabel: "ダブルチーズバーガー", itemName: "ダブルチーズバーガー" },
  { pdfLabel: "チキンフィレオ", itemName: "チキンフィレオ" },
  { pdfLabel: "チーズバーガー", itemName: "チーズバーガー" },
  { pdfLabel: "マックチキン", itemName: "マックチキン" },
  { pdfLabel: "ハンバーガー", itemName: "ハンバーガー" },
  { pdfLabel: "チキンマックナゲット", itemName: "チキンマックナゲット 5ピース" },
  { pdfLabel: "ソーセージエッグマフィン", itemName: "ソーセージエッグマフィン" },
  { pdfLabel: "ビッグマック", itemName: "ビッグマック" },
  { pdfLabel: "てりやきマックバーガー", itemName: "てりやきマックバーガー" },
  { pdfLabel: "エッグマックマフィン", itemName: "エッグマックマフィン" },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toInt(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function toNullableNumber(value: string): number | null {
  return value === "※" ? null : Number(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u000c/g, "").replace(/[ \t\u3000]+/g, " ").trim();
}

function normalizeTilde(value: string): string {
  return value.replace(/[〜～]/g, "〜");
}

function stripRegionTag(value: string): string {
  let next = value.trim();
  while (REGION_TAG_PATTERN.test(next)) {
    next = next.replace(REGION_TAG_PATTERN, "").trim();
  }
  return next;
}

function cleanDisplayName(value: string): string {
  return normalizeTilde(
    stripRegionTag(value)
      .replace(/【朝】/g, "")
      .replace(/[(（](?:ミニ|小盛|並盛|中盛|アタマの大盛|あたま大盛|大盛|特盛|超特盛|メガ|単品|ドリンク含まず)[)）]/g, "")
      .replace(/\s+\((?:お好みソース|タルタルソース|粗切り本わさび)\)/g, (match) => match.replace(/\s+/g, ""))
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeMatchName(value: string): string {
  return cleanDisplayName(value)
    .normalize("NFKC")
    .replace(/[()（）【】\[\]・･'"]/g, "")
    .replace(/[〜～]/g, "〜")
    .replace(/[ 　]/g, "")
    .replace(/第?\d+弾/g, "")
    .replace(/※.*$/g, "")
    .replace(/のせ/g, "のせ")
    .trim();
}

function buildTags(item: Omit<ItemRecord, "id">): string[] {
  const tags = new Set<string>();

  if (item.calories !== null && item.calories > 0 && item.price / item.calories < 1.0) {
    tags.add("value");
  }
  if (item.protein !== null && item.protein > 25) {
    tags.add("high-protein");
  }
  if (item.calories !== null && item.calories < 300) {
    tags.add("low-calorie");
  }
  if (
    item.protein !== null &&
    item.carbs !== null &&
    item.salt !== null &&
    item.protein > 15 &&
    item.carbs < 80 &&
    item.salt < 3.0
  ) {
    tags.add("balanced");
  }

  return [...tags];
}

function makeItem(item: Omit<ItemRecord, "id" | "tags">): Omit<ItemRecord, "id"> {
  const normalized: Omit<ItemRecord, "id"> = {
    ...item,
    name: cleanDisplayName(item.name),
    calories: item.calories === null ? null : Math.round(item.calories),
    protein: item.protein === null ? null : round1(item.protein),
    carbs: item.carbs === null ? null : round1(item.carbs),
    salt: item.salt === null ? null : round1(item.salt),
  };
  normalized.tags = buildTags(normalized);
  return normalized;
}

async function readUtf8(path: string | URL): Promise<string> {
  return readFile(path, "utf8");
}

function parsePriceSections(text: string) {
  const sections = new Map<string, Map<string, PriceEntry>>();
  let currentChain = "";
  let currentSection = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const chainMatch = line.match(/^===\s*(.+?)\s+価格/);
    if (chainMatch) {
      currentChain = chainMatch[1] ?? "";
      currentSection = "";
      sections.set(currentChain, new Map());
      continue;
    }
    const sectionMatch = line.match(/^#\s*(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1] ?? "";
      continue;
    }
    if (!line.includes("\t") || !currentChain) {
      continue;
    }

    const [rawName, rawPrice] = line.split(/\t+/);
    const price = Number(rawPrice);
    if (!rawName || !Number.isFinite(price)) {
      continue;
    }

    const entry: PriceEntry = {
      rawName,
      displayName: cleanDisplayName(
        rawName
          .replace(/\((?:ミニ|小盛|並盛|中盛|アタマの大盛|あたま大盛|大盛|特盛|超特盛|メガ)\)/g, "")
          .replace(/\((?:単品1個|単品)\)/g, "")
          .trim(),
      ),
      price,
      section: currentSection,
    };

    sections.get(currentChain)?.set(normalizeMatchName(rawName), entry);
  }

  return sections;
}

function parseNutritionLine(rawLine: string): NutritionRow | null {
  const line = normalizeWhitespace(rawLine);
  const match = line.match(ROW_NUMERIC_PATTERN);
  if (!match) {
    return null;
  }

  const left = normalizeWhitespace(match[1] ?? "");
  const cleaned = left
    .split(" ")
    .filter((token, index, tokens) => !(index < tokens.length - 1 && token.length === 1))
    .join(" ")
    .trim();

  let name: string | null = null;
  let size: string | null = null;

  if (SIZE_TOKENS.includes(cleaned as (typeof SIZE_TOKENS)[number])) {
    size = cleaned;
  } else {
    const parenMatch = cleaned.match(/^(.*?)[(（](小盛|並盛|アタマの大盛|あたま大盛|大盛|特盛|超特盛)[)）]$/);
    const suffixMatch = cleaned.match(/^(.*?)\s+(小盛|並盛|アタマの大盛|あたま大盛|大盛|特盛|超特盛)$/);
    if (parenMatch) {
      name = cleanDisplayName(parenMatch[1] ?? "");
      size = parenMatch[2] ?? null;
    } else if (suffixMatch) {
      name = cleanDisplayName(suffixMatch[1] ?? "");
      size = suffixMatch[2] ?? null;
    } else {
      name = cleanDisplayName(cleaned);
    }
  }

  return {
    name,
    size,
    calories: toInt(match[2] ?? "0"),
    protein: toNullableNumber(match[3] ?? "※"),
    fat: toNullableNumber(match[4] ?? "※"),
    carbs: toNullableNumber(match[5] ?? "※"),
    salt: toNullableNumber(match[6] ?? "※"),
  };
}

function parseTableRows(text: string): NutritionRow[] {
  const rows: NutritionRow[] = [];
  let currentName: string | null = null;
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const row = parseNutritionLine(rawLine);
    if (row) {
      if (row.name === null) {
        row.name = currentName;
      } else {
        currentName = row.name;
      }
      if (row.name && !shouldIgnoreStandaloneName(row.name)) {
        rows.push(row);
      }
      continue;
    }

    const line = normalizeWhitespace(rawLine).replace(/※.*$/, "").trim();
    if (!line || shouldIgnoreStandaloneName(line)) {
      continue;
    }
    if (
      /[一-龠ぁ-んァ-ン]/.test(line) &&
      !/\d/.test(line) &&
      line.length <= 24 &&
      !/[。:]/.test(line)
    ) {
      currentName = cleanDisplayName(line);
    }
  }

  return rows;
}

function shouldIgnoreStandaloneName(value: string): boolean {
  return (
    !value ||
    value.length < 2 ||
    /^(メニュー|栄養|熱量|量|たんぱく質|脂質|炭水化物|食塩相当量|分類|おすすめ|カレーメニュー|その他のカレーメニュー)$/.test(value) ||
    /(お問い合わせ|一覧|現在|アレルギー|原材料|お持ち帰り|店舗|更新日|メニュー全情報|普通\(300g\)|普通\(200g\)|ドリンク含まず)/.test(value) ||
    /^[○●▲△ー-]+$/.test(value)
  );
}

function formatSizedName(name: string, size: string): string {
  return `${name} ${size}`;
}

function scaleNullable(value: number | null, multiplier: number): number | null {
  return value === null ? null : round1(value * multiplier);
}

function findNearbyNutritionRow(
  text: string,
  displayName: string,
  size: string | null,
  allowUnnamedRow = false,
  aliases: string[] = [],
): NutritionRow | null {
  const lines = text.split(/\r?\n/).map((line) => normalizeWhitespace(line));
  const targets = [displayName, ...aliases].map((name) => normalizeMatchName(name));
  let best: { score: number; row: NutritionRow } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = normalizeMatchName(lines[index] ?? "");
    if (
      !targets.some(
        (target) => target && (normalizedLine === target || normalizedLine.startsWith(target) || normalizedLine.endsWith(target)),
      )
    ) {
      continue;
    }

    for (let cursor = index; cursor <= Math.min(lines.length - 1, index + 12); cursor += 1) {
      const row = parseNutritionLine(lines[cursor] ?? "");
      if (!row) {
        continue;
      }
      if (size && row.size !== size) {
        continue;
      }
      if (!size && row.size && row.size !== "並盛") {
        continue;
      }
      const rowName = row.name ? normalizeMatchName(row.name) : "";
      const exact = targets.some((target) => rowName === target);
      const nearby = row.name === null;
      const noisyName = row.name !== null && (/[。※]/.test(row.name) || rowName.length <= 3);
      if (!exact && !nearby && rowName && !(size && noisyName)) {
        continue;
      }
      if (nearby && !allowUnnamedRow) {
        continue;
      }

      const score = Math.abs(cursor - index) + (exact ? 0 : nearby ? 2 : 4);
      if (best === null || score < best.score) {
        best = { score, row };
      }
    }
  }

  return best?.row ?? null;
}

function isNoisyNutritionName(value: string | null): boolean {
  if (value === null) {
    return true;
  }
  const normalized = normalizeMatchName(value);
  return /[。※]/.test(value) || normalized.length <= 3;
}

function isStandaloneMenuCandidate(value: string): boolean {
  return (
    !!value &&
    /[一-龠ぁ-んァ-ン]/.test(value) &&
    !/\d/.test(value) &&
    !/[。:]/.test(value) &&
    !shouldIgnoreStandaloneName(value)
  );
}

function findYoshinoyaSizedRows(
  text: string,
  displayName: string,
  aliases: string[] = [],
): Map<(typeof YOSHINOYA_SIZE_ORDER)[number], NutritionRow> {
  const lines = text.split(/\r?\n/).map((line) => normalizeWhitespace(line));
  const targets = [displayName, ...aliases].map((name) => normalizeMatchName(name));
  let bestRows = new Map<(typeof YOSHINOYA_SIZE_ORDER)[number], { distance: number; row: NutritionRow }>();

  const collectRow = (
    rows: Map<(typeof YOSHINOYA_SIZE_ORDER)[number], { distance: number; row: NutritionRow }>,
    cursor: number,
    anchor: number,
  ) => {
    const row = parseNutritionLine(lines[cursor] ?? "");
    if (!row || !row.size || !YOSHINOYA_SIZE_ORDER.includes(row.size as (typeof YOSHINOYA_SIZE_ORDER)[number])) {
      return;
    }
    const exact = row.name ? targets.some((target) => normalizeMatchName(row.name ?? "") === target) : false;
    if (!exact && !isNoisyNutritionName(row.name)) {
      return;
    }
    const key = row.size as (typeof YOSHINOYA_SIZE_ORDER)[number];
    const current = rows.get(key);
    const distance = Math.abs(cursor - anchor);
    if (!current || distance < current.distance) {
      rows.set(key, { distance, row });
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = normalizeMatchName(lines[index] ?? "");
    if (
      !targets.some(
        (target) => target && (normalizedLine === target || normalizedLine.startsWith(target) || normalizedLine.endsWith(target)),
      )
    ) {
      continue;
    }

    const candidateRows = new Map<(typeof YOSHINOYA_SIZE_ORDER)[number], { distance: number; row: NutritionRow }>();
    for (let cursor = Math.max(0, index - 2); cursor < index; cursor += 1) {
      collectRow(candidateRows, cursor, index);
    }
    for (let cursor = index; cursor <= Math.min(lines.length - 1, index + 12); cursor += 1) {
      const line = lines[cursor] ?? "";
      if (
        cursor > index &&
        isStandaloneMenuCandidate(line) &&
        !targets.some((target) => {
          const normalized = normalizeMatchName(line);
          return target && (normalized === target || normalized.startsWith(target) || normalized.endsWith(target));
        })
      ) {
        break;
      }
      collectRow(candidateRows, cursor, index);
    }

    if (candidateRows.size > bestRows.size) {
      bestRows = candidateRows;
    }
  }

  return new Map([...bestRows.entries()].map(([size, entry]) => [size, entry.row]));
}

function inferYoshinoyaCategory(section: string, name: string): { category: string; categoryGroup: "signature" | "side" } {
  if (section.includes("朝食")) {
    return { category: "breakfast", categoryGroup: "signature" };
  }
  if (section.includes("サイド")) {
    return { category: "side", categoryGroup: "side" };
  }
  if (section.includes("カレー") || name.includes("カレー")) {
    return { category: "curry", categoryGroup: "signature" };
  }
  if (section.includes("定食") || name.includes("定食")) {
    return { category: "set", categoryGroup: "signature" };
  }
  return { category: "bowl", categoryGroup: "signature" };
}

function buildNutritionRowIndex(rows: NutritionRow[]) {
  const byName = new Map<string, NutritionRow>();

  for (const row of rows) {
    if (!row.name) {
      continue;
    }
    if (row.size && row.size !== "並盛") {
      continue;
    }
    const key = normalizeMatchName(row.name);
    if (!byName.has(key)) {
      byName.set(key, row);
    }
  }

  return byName;
}

function resolveNutritionRowByName(
  name: string,
  rowIndex: Map<string, NutritionRow>,
  nutritionText: string,
): NutritionRow | null {
  const key = normalizeMatchName(name);
  return (
    rowIndex.get(key) ??
    [...rowIndex.entries()].find(([rowKey]) => rowKey === key || rowKey.startsWith(key) || rowKey.includes(key))?.[1] ??
    findNearbyNutritionRow(nutritionText, name, null, false)
  );
}

function sumNutritionRows(
  parts: Array<{ name: string; quantity?: number }>,
  rowIndex: Map<string, NutritionRow>,
  nutritionText: string,
): NutritionRow | null {
  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  let salt = 0;

  for (const part of parts) {
    const row = resolveNutritionRowByName(part.name, rowIndex, nutritionText);
    if (!row || row.protein === null || row.fat === null || row.carbs === null || row.salt === null) {
      return null;
    }
    const quantity = part.quantity ?? 1;
    calories += row.calories * quantity;
    protein += row.protein * quantity;
    fat += row.fat * quantity;
    carbs += row.carbs * quantity;
    salt += row.salt * quantity;
  }

  return {
    name: null,
    size: null,
    calories,
    protein,
    fat,
    carbs,
    salt,
  };
}

function sumYoshinoyaSizedNutritionRows(
  parts: Array<{ name: string; quantity?: number }>,
  size: (typeof YOSHINOYA_SIZE_ORDER)[number],
  sizedRowIndex: Map<string, Map<(typeof YOSHINOYA_SIZE_ORDER)[number], NutritionRow>>,
  rowIndex: Map<string, NutritionRow>,
  nutritionText: string,
): NutritionRow | null {
  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  let salt = 0;

  for (const part of parts) {
    const key = normalizeMatchName(part.name);
    const row = sizedRowIndex.get(key)?.get(size) ?? resolveNutritionRowByName(part.name, rowIndex, nutritionText);
    if (!row || row.protein === null || row.fat === null || row.carbs === null || row.salt === null) {
      return null;
    }
    const quantity = part.quantity ?? 1;
    calories += row.calories * quantity;
    protein += row.protein * quantity;
    fat += row.fat * quantity;
    carbs += row.carbs * quantity;
    salt += row.salt * quantity;
  }

  return {
    name: null,
    size,
    calories,
    protein,
    fat,
    carbs,
    salt,
  };
}

function buildYoshinoyaItems(priceMap: Map<string, PriceEntry>, nutritionText: string): Omit<ItemRecord, "id">[] {
  const items: Omit<ItemRecord, "id">[] = [];
  const seen = new Set<string>();
  const rowIndex = buildNutritionRowIndex(parseTableRows(nutritionText));
  const sizedRowIndex = new Map<string, Map<(typeof YOSHINOYA_SIZE_ORDER)[number], NutritionRow>>();

  const getSizedRows = (name: string, aliases: string[] = []) => {
    const key = normalizeMatchName(name);
    const cached = sizedRowIndex.get(key);
    if (cached) {
      return cached;
    }
    const rows = findYoshinoyaSizedRows(nutritionText, name, aliases);
    sizedRowIndex.set(key, rows);
    return rows;
  };

  for (const entry of priceMap.values()) {
    if (/弁当|ファミリーパック|三人前|四人前/.test(entry.rawName)) {
      continue;
    }

    const desiredSize = /\(並盛\)/.test(entry.rawName) ? "並盛" : null;
    const aliases = YOSHINOYA_ALIASES[entry.displayName] ?? YOSHINOYA_ALIASES[entry.rawName] ?? [];
    const category = inferYoshinoyaCategory(entry.section, entry.displayName);
    if (desiredSize) {
      const sizeRows = getSizedRows(entry.displayName, aliases);
      const matchedRows = YOSHINOYA_SIZE_ORDER.flatMap((size) => {
        const row =
          sizeRows.get(size) ??
          (YOSHINOYA_COMPOSITION_RECIPES[entry.displayName]
            ? sumYoshinoyaSizedNutritionRows(
                YOSHINOYA_COMPOSITION_RECIPES[entry.displayName],
                size,
                sizedRowIndex,
                rowIndex,
                nutritionText,
              )
            : null);
        return row ? [{ size, row }] : [];
      });
      if (matchedRows.length > 0) {
        for (const { size, row } of matchedRows) {
          const key = `${normalizeMatchName(entry.displayName)}:${size}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          items.push(
            makeItem({
              chainId: "yoshinoya",
              name: formatSizedName(entry.displayName, size),
              category: category.category,
              categoryGroup: category.categoryGroup,
              price: entry.price + YOSHINOYA_SIZE_PRICE_ADJUSTMENTS[size],
              calories: row.calories,
              protein: row.protein,
              carbs: row.carbs,
              salt: row.salt,
            }),
          );
        }
        continue;
      }
    }

    const directRow =
      findNearbyNutritionRow(nutritionText, entry.displayName, desiredSize, desiredSize !== null, aliases) ??
      rowIndex.get(normalizeMatchName(entry.displayName)) ??
      rowIndex.get(normalizeMatchName(entry.rawName)) ??
      aliases.map((alias) => rowIndex.get(normalizeMatchName(alias))).find((row) => row !== undefined);
    const recipe = YOSHINOYA_COMPOSITION_RECIPES[entry.displayName];
    const row = directRow ?? (recipe ? sumNutritionRows(recipe, rowIndex, nutritionText) : null);
    if (!row) {
      continue;
    }

    const key = `${normalizeMatchName(entry.displayName)}:single`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(
      makeItem({
        chainId: "yoshinoya",
        name: entry.displayName,
        category: category.category,
        categoryGroup: category.categoryGroup,
        price: entry.price,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        salt: row.salt,
      }),
    );
  }

  return items;
}

const COCOICHI_PRICE_ESTIMATES: Record<string, number> = {
  甘口ポークカレー: 646,
  ハヤシライス: 794,
  牛すじ煮込みカレー: 910,
  "クリームコロッケ(カニ入り)(2個)カレー": 950,
};

function inferMatsuyaCategory(name: string): { category: string; categoryGroup: "signature" | "side" } {
  if (/^【朝】|朝食|和朝食|洋朝食|得朝/.test(name)) {
    return { category: "breakfast", categoryGroup: "signature" };
  }
  if (name.includes("カレー")) {
    return { category: "curry", categoryGroup: "signature" };
  }
  if (name.includes("定食")) {
    return { category: "set", categoryGroup: "signature" };
  }
  if (/(みそ汁|豚汁|サラダ|玉子|納豆|冷奴|キムチ|海苔|ポテト|ソーセージエッグ)/.test(name)) {
    return { category: "side", categoryGroup: "side" };
  }
  return { category: "bowl", categoryGroup: "signature" };
}

function estimateMatsuyaPrice(name: string): number {
  if (/^【朝】|朝食|和朝食|洋朝食|得朝/.test(name)) return 390;
  if (name.includes("ソーセージエッグ定食")) return 630;
  if (name.includes("ソーセージエッグW定食")) return 730;
  if (name === "みそ汁") return 80;
  if (name === "豚汁") return 180;
  if (name.includes("サラダ")) return 150;
  if (name.includes("冷奴") || name.includes("冷やっこ")) return 140;
  if (name.includes("半熟玉子")) return 100;
  if (name.includes("生玉子") || name === "たまご") return 100;
  if (name.includes("納豆")) return 120;
  if (name.includes("牛めし")) return 460;
  if (name.includes("キムカル丼")) return 690;
  if (name.includes("牛ビビン丼")) return 790;
  if (name.includes("豚カルビ丼")) return 690;
  if (name.includes("いぶりがっこ牛めし")) return 610;
  if (name.includes("牛とじかつ丼")) return 990;
  if (name.includes("牛とじ丼")) return 690;
  if (name.includes("衣笠丼")) return 630;
  if (name.includes("カレギュウ")) return 1050;
  if (name.includes("牛タンカレー")) return name.includes("チーズ") ? 1290 : name.includes("ハンバーグ") ? 1390 : 1180;
  if (name.includes("うまトマハンバーグ創業ビーフカレー")) return 1280;
  if (name.includes("ハンバーグ創業ビーフカレー")) return 1150;
  if (name.includes("チーズ創業ビーフカレー")) return 980;
  if (name.includes("創業ビーフカレー")) return 780;
  if (name.includes("定食")) {
    if (name.includes("ダブル")) return 1390;
    if (name.includes("牛ミルフィーユ")) return 1290;
    if (name.includes("ポークグリル")) return 1090;
    if (name.includes("チーズIN")) return 1080;
    if (name.includes("ハンバーグ")) return 990;
    if (name.includes("鮭")) return 800;
    return 890;
  }
  return 690;
}

function buildMatsuyaItems(priceMap: Map<string, PriceEntry>, nutritionText: string): Omit<ItemRecord, "id">[] {
  const rows = parseTableRows(nutritionText);
  const items: Omit<ItemRecord, "id">[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.name) {
      continue;
    }
    const name = cleanDisplayName(row.name);
    if (
      /(単品|沖縄|ドリンク含まず|牛皿・|地域|店舗|カレーは共通メニュー|ファミリー|おこさま|わくわくセット|コンボ|スペシャル)/.test(name) ||
      /(小鉢|ミニサラダセット|生玉子or半熟玉子|生野菜セット|変更|（並）)/.test(name) ||
      /(コーラ|茶|コーヒー|ビール|ドライ|紅生姜|七味|醤油|ケチャップ|ジャム|バター|ドレッシング|タレ|ネギおろし|青ネギ)/.test(name)
    ) {
      continue;
    }

    const category = inferMatsuyaCategory(name);
    if (
      (category.categoryGroup === "side" &&
        !/^(みそ汁|豚汁|生野菜|お新香|キムチ|冷やっこ|ポテサラ|半熟玉子|生玉子|納豆（ネギ付）|国産とろろ|ミニ牛皿|豆乳ぷりん|炙りチーズポテト)$/.test(
          name,
        )) ||
      (category.categoryGroup === "signature" &&
        !/(牛めし|丼|カレー|定食|朝食|和朝食|洋朝食|得朝)/.test(name))
    ) {
      continue;
    }
    if (row.calories <= 20 && name !== "みそ汁") {
      continue;
    }

    const normalized = normalizeMatchName(name);
    const size = row.size && MATSUYA_SIZE_ORDER.includes(row.size as (typeof MATSUYA_SIZE_ORDER)[number]) ? row.size : null;
    const key = `${normalized}:${size ?? "single"}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const basePriceEntry =
      priceMap.get(`${normalized}:並盛`) ??
      priceMap.get(`${normalized}:single`) ??
      priceMap.get(normalized) ??
      [...priceMap.entries()].find(([key]) => key.includes(normalized))?.[1];
    const basePrice = basePriceEntry?.price ?? estimateMatsuyaPrice(name);
    const price =
      size && size in MATSUYA_SIZE_PRICE_ADJUSTMENTS
        ? basePrice + MATSUYA_SIZE_PRICE_ADJUSTMENTS[size as keyof typeof MATSUYA_SIZE_PRICE_ADJUSTMENTS]
        : basePrice;

    items.push(
      makeItem({
        chainId: "matsuya",
        name: size ? formatSizedName(name, size) : name,
        category: category.category,
        categoryGroup: category.categoryGroup,
        price,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        salt: row.salt,
      }),
    );
  }

  return items.filter((item) => !/メニュー|情報/.test(item.name));
}

function parseTabSeparated(text: string): Array<Record<string, string>> {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split("\t");
  return lines
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length === keys.length)
    .map((cells) => Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""])));
}

function normalizeMcdonaldsName(name: string): string {
  return cleanDisplayName(
    name
      .replace(/\((M|S|L)\)/g, " $1")
      .replace(/（(M|S|L)）/g, " $1")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function inferMcdonaldsCategory(name: string): { category: string; categoryGroup: "signature" | "side" } {
  if (
    /(バーガー|ビッグマック|チーズバーガー|マックチキン|マックポーク|フィレオ|BLT|エグチ|ビーフ)/.test(name)
  ) {
    return { category: "burger", categoryGroup: "signature" };
  }
  if (/(マフィン|グリドル|ホットケーキ|プチパンケーキ)/.test(name)) {
    return { category: "breakfast", categoryGroup: "signature" };
  }
  if (/(ツイスト|フルーリー|シェイク|アップルパイ)/.test(name)) {
    return { category: "dessert", categoryGroup: "side" };
  }
  return { category: "side", categoryGroup: "side" };
}

function isMcdonaldsBreakfastOnly(name: string, category: string): boolean {
  if (category === "breakfast") {
    return true;
  }

  return name === "ハッシュポテト" || name.includes("マックサンド");
}

function estimateMcdonaldsPrice(name: string): number {
  if (name.includes("炙り醤油風 たまごベーコン肉厚ビーフ")) return 570;
  if (name.includes("炙り醤油風 ダブル肉厚ビーフ")) return 680;
  if (name.includes("チーズチーズダブルチーズバーガー")) return 560;
  if (name.includes("チーズチーズてりやきマックバーガー")) return 520;
  if (name.includes("シャカチキ")) return 190;
  return 300;
}

function parseMcdonaldsPricePdf(text: string): Record<string, number> {
  const prices: Record<string, number> = {};
  const normalizedLines = text.split(/\r?\n/).map((line) => normalizeWhitespace(line));

  for (const { pdfLabel, itemName } of MCDONALDS_PDF_PATTERNS) {
    const line = normalizedLines.find((entry) => entry.includes(pdfLabel) && entry.includes("円"));
    if (!line) {
      continue;
    }
    const matches = [...line.matchAll(/(\d+)\s*円/g)].map((match) => Number(match[1]));
    if (matches.length > 0) {
      prices[itemName] = matches[matches.length - 1] ?? matches[0] ?? 0;
    }
  }

  return prices;
}

function buildMcdonaldsItems(tsvText: string, pdfPrices: Record<string, number>): Omit<ItemRecord, "id">[] {
  const records = parseTabSeparated(tsvText);
  const items: Omit<ItemRecord, "id">[] = [];

  for (const record of records) {
    const rawName = record.name ?? "";
    const name = normalizeMcdonaldsName(rawName);
    if (
      !name ||
      name.startsWith("倍") ||
      /(コーヒー|コーラ|ジュース|ファンタ|スプライト|爽健美茶|ミニッツメイド)/.test(name) ||
      /(McCafe|マカロン|ラテ|カプチーノ|フラッペ)/.test(name) ||
      /(てりたま|てりやきチキンフィレオ)/.test(name)
    ) {
      continue;
    }

    const category = inferMcdonaldsCategory(name);
    if (isMcdonaldsBreakfastOnly(name, category.category)) {
      continue;
    }

    const price = MCDONALDS_PRICE_OVERRIDES[name] ?? pdfPrices[name] ?? estimateMcdonaldsPrice(name);

    items.push(
      makeItem({
        chainId: "mcdonalds",
        name,
        category: category.category,
        categoryGroup: category.categoryGroup,
        price,
        calories: Number(record.calories ?? "0"),
        protein: Number(record.protein ?? "0"),
        carbs: Number(record.carbs ?? "0"),
        salt: Number(record.salt ?? "0"),
      }),
    );
  }

  return dedupeItems(items);
}

function parseCocoichiNutrition(text: string) {
  const map = new Map<string, NutritionRow>();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeWhitespace(lines[index] ?? "");
    if (!line) {
      continue;
    }

    const match = line.match(/^(.*?)\s+(\d{1,3}(?:,\d{3})?)\s+(\d+\.\d)\s+(\d+\.\d)\s+(\d+\.\d)\s+(\d+\.\d)$/);
    if (match) {
      const row: NutritionRow = {
        name: cleanDisplayName(match[1] ?? ""),
        size: null,
        calories: toInt(match[2] ?? "0"),
        protein: Number(match[3] ?? "0"),
        fat: Number(match[4] ?? "0"),
        carbs: Number(match[5] ?? "0"),
        salt: Number(match[6] ?? "0"),
      };
      if (!shouldIgnoreStandaloneName(row.name ?? "")) {
        map.set(normalizeMatchName(row.name ?? ""), row);
      }
      continue;
    }

    if (line === "低糖質カレー") {
      const next = normalizeWhitespace(lines[index + 1] ?? "");
      const nextMatch = next.match(/^(\d{1,3}(?:,\d{3})?)\s+(\d+\.\d)\s+(\d+\.\d)$/);
      if (nextMatch) {
        map.set(normalizeMatchName(line), {
          name: line,
          size: null,
          calories: toInt(nextMatch[1] ?? "0"),
          protein: Number(nextMatch[2] ?? "0"),
          fat: Number(nextMatch[3] ?? "0"),
          carbs: 25.1,
          salt: 3.0,
        });
      }
    }
  }

  const pork = map.get(normalizeMatchName("ポークカレー"));
  const eggFry = map.get(normalizeMatchName("とろ〜りたまフライ")) ?? map.get(normalizeMatchName("とろ～りたまフライ"));
  if (pork && eggFry) {
    map.set(normalizeMatchName("とろ〜りたまフライカレー"), {
      name: "とろ〜りたまフライカレー",
      size: null,
      calories: pork.calories + eggFry.calories,
      protein: round1((pork.protein ?? 0) + (eggFry.protein ?? 0)),
      fat: round1((pork.fat ?? 0) + (eggFry.fat ?? 0)),
      carbs: round1((pork.carbs ?? 0) + (eggFry.carbs ?? 0)),
      salt: round1((pork.salt ?? 0) + (eggFry.salt ?? 0)),
    });
  }

  return map;
}

function buildCocoichiItems(priceMap: Map<string, PriceEntry>, nutritionText: string): Omit<ItemRecord, "id">[] {
  const nutritionMap = parseCocoichiNutrition(nutritionText);
  const items: Omit<ItemRecord, "id">[] = [];
  const seen = new Set<string>();

  for (const entry of priceMap.values()) {
    const key = normalizeMatchName(entry.displayName);
    const nutrition =
      nutritionMap.get(key) ??
      nutritionMap.get(normalizeMatchName(entry.rawName)) ??
      nutritionMap.get(normalizeMatchName(entry.displayName.replace(/～/g, "〜")));
    if (!nutrition) {
      continue;
    }

    seen.add(key);
    items.push(
      makeItem({
        chainId: "cocoichi",
        name: entry.displayName,
        category: "curry",
        categoryGroup: "signature",
        price: entry.price,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        salt: nutrition.salt,
      }),
    );
  }

  for (const [key, nutrition] of nutritionMap.entries()) {
    const name = cleanDisplayName(nutrition.name ?? "");
    if (
      !name ||
      seen.has(key) ||
      !/(カレー|ハヤシライス)/.test(name) ||
      /(スープカレー|カレーうどん|カレーらーめん|ドリア|お子さま|ミニ|コンボ|期間限定|数量限定|トッピング|ソース|サラダ|ドリンク)/.test(name)
    ) {
      continue;
    }

    const price = COCOICHI_PRICE_ESTIMATES[name];
    if (price === undefined) {
      continue;
    }

    seen.add(key);
    items.push(
      makeItem({
        chainId: "cocoichi",
        name,
        category: "curry",
        categoryGroup: "signature",
        price,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        salt: nutrition.salt,
      }),
    );
  }

  if (!items.some((item) => item.name === "低糖質カレー")) {
    items.push(
      makeItem({
        chainId: "cocoichi",
        name: "低糖質カレー",
        category: "curry",
        categoryGroup: "signature",
        price: 725,
        calories: 255,
        protein: 8.0,
        carbs: 25.1,
        salt: 3.0,
      }),
    );
  }

  return dedupeItems(items);
}

function inferSushiCategory(name: string): string {
  if (/(うどん|ラーメン|そば|ワンタンメン|らーめん)/.test(name)) {
    return "noodle";
  }
  if (/(パフェ|プリン|ケーキ|大学いも|アイス|ミルクレープ|ソフト|パンケーキ|クレープ|デザート|カップ|パイン|ぶどう|マンゴー|フルーツ|シャーベット)/.test(name)) {
    return "dessert";
  }
  if (/(みそ汁|味噌汁|赤だし|茶碗蒸し|ポテト|サラダ|フライ|唐揚げ|枝豆|コーン|汁|蒸し|キムチ|貝わさび|なす旨煮)/.test(name)) {
    return "side";
  }
  if (/(軍艦|巻|手巻き|ロール|いなり|ねぎまぐろ|たらこ|たらマヨ|小粒納豆|ツナサラダ|シーサラダ|かにみそ|コーン)/.test(name)) {
    return "gunkan";
  }
  return "sushi";
}

function mapSushiroOfficialCategory(rawCategory: string, name: string): string | null {
  if (rawCategory === "にぎり") {
    return "sushi";
  }
  if (rawCategory === "軍艦・巻物") {
    return "gunkan";
  }
  if (rawCategory === "サイドメニュー") {
    return /(うどん|ラーメン|そば|ワンタンメン|らーめん)/.test(name) ? "noodle" : "side";
  }
  if (rawCategory === "デザート") {
    return "dessert";
  }
  return null;
}

function estimateSushiNutrition(category: string, calories: number, singlePiece = false) {
  if (category === "sushi" || category === "gunkan") {
    const protein = singlePiece ? 2.5 : 4.0;
    const fat = singlePiece ? 0.6 : 1.0;
    const carbs = Math.max(0, round1((calories - protein * 4 - fat * 9) / 4));
    return {
      protein,
      carbs,
      salt: 0.3,
    };
  }
  if (category === "noodle") {
    return {
      protein: round1(Math.max(5, calories * 0.06)),
      carbs: round1(Math.max(20, calories * 0.17)),
      salt: round1(Math.max(2.0, Math.min(6.0, calories / 120))),
    };
  }
  if (category === "dessert") {
    return {
      protein: round1(Math.max(2, calories * 0.02)),
      carbs: round1(Math.max(12, calories * 0.18)),
      salt: round1(calories < 200 ? 0.2 : 0.3),
    };
  }
  return {
    protein: round1(Math.max(3, calories * 0.05)),
    carbs: round1(Math.max(4, calories * 0.11)),
    salt: round1(calories < 120 ? 0.8 : calories < 250 ? 1.3 : 2.0),
  };
}

function estimateKuraPrice(name: string, category: string): number {
  if (category === "noodle") {
    if (name.includes("かき揚げ")) return 390;
    if (name.includes("シャリカレー")) return 390;
    return 280;
  }
  if (category === "dessert") {
    if (name.includes("パフェ")) return 300;
    return 220;
  }
  if (category === "side") {
    if (name.includes("茶碗蒸し")) return 220;
    if (name.includes("汁")) return 220;
    return 250;
  }
  return name.includes("一貫") ? 165 : 115;
}

function estimateHamaPrice(name: string, category: string): number {
  if (category === "noodle") {
    if (name.includes("えび天")) return 396;
    return 396;
  }
  if (category === "dessert") {
    if (name.includes("パフェ")) return 300;
    return 220;
  }
  if (category === "side") {
    if (name.includes("茶碗蒸し")) return 220;
    if (name.includes("みそ汁") || name.includes("味噌汁")) return 165;
    return 220;
  }
  return name.includes("一貫") ? 165 : 110;
}

function cleanHamazushiName(value: string): string {
  return cleanDisplayName(value)
    .replace(/^[（(](?:にぎり|軍艦|つつみ)[)）]\s*/u, "")
    .replace(/^(?:おすすめ|にぎり|軍艦)\s+/, "")
    .trim();
}

function normalizeHamazushiName(value: string): string {
  return normalizeMatchName(cleanHamazushiName(value));
}

function mapHamazushiScrapedCategory(rawCategory: string, name: string): string {
  const inferred = inferSushiCategory(name);

  if (rawCategory === "gunkan") {
    return "gunkan";
  }
  if (rawCategory === "dessert" || rawCategory === "shifuku") {
    return "dessert";
  }
  if (rawCategory === "side") {
    return inferred === "dessert" || inferred === "noodle" ? inferred : "side";
  }
  if (rawCategory === "nigiri" || rawCategory === "nikunigiri") {
    return "sushi";
  }
  if (rawCategory === "zeitaku") {
    return inferred === "gunkan" || inferred === "side" || inferred === "dessert" || inferred === "noodle"
      ? inferred
      : "sushi";
  }
  return inferred;
}

function estimateHamazushiCalories(category: string): number {
  if (category === "noodle") {
    return 300;
  }
  if (category === "side") {
    return 150;
  }
  if (category === "dessert") {
    return 120;
  }
  return 60;
}

function parseHamazushiScrapedEntries(text: string): HamazushiScrapedEntry[] {
  return parseTabSeparated(text)
    .map((record) => {
      const name = cleanHamazushiName(record.name ?? "");
      const price = Number(record.price ?? "0");
      const rawCategory = record.category ?? "";
      return {
        name,
        price,
        rawCategory,
        category: mapHamazushiScrapedCategory(rawCategory, name),
      };
    })
    .filter((entry) => entry.name && Number.isFinite(entry.price));
}

function buildHamazushiPriceLookup(entries: HamazushiScrapedEntry[]) {
  const lookup = new Map<string, HamazushiScrapedEntry[]>();

  for (const entry of entries) {
    const key = normalizeHamazushiName(entry.name);
    const bucket = lookup.get(key) ?? [];
    bucket.push(entry);
    lookup.set(key, bucket);
  }

  return lookup;
}

function findHamazushiScrapedEntry(
  lookup: Map<string, HamazushiScrapedEntry[]>,
  name: string,
  category: string,
): HamazushiScrapedEntry | null {
  const entries = lookup.get(normalizeHamazushiName(name));
  if (!entries || entries.length === 0) {
    return null;
  }

  const exactCategoryEntries = entries.filter((entry) => entry.category === category);
  if (exactCategoryEntries.length > 0) {
    return exactCategoryEntries.find((entry) => entry.rawCategory !== "limited") ?? exactCategoryEntries[0] ?? null;
  }

  return entries.find((entry) => entry.rawCategory !== "limited") ?? entries[0] ?? null;
}

function estimateSushiroPrice(name: string, category: string): number {
  if (category === "noodle") {
    if (name.includes("ラーメン") || name.includes("ワンタンメン")) return 490;
    return 390;
  }
  if (category === "dessert") {
    if (name.includes("パフェ")) return 360;
    return 220;
  }
  if (category === "side") {
    if (name.includes("ポテト")) return 200;
    if (name.includes("茶碗蒸し")) return 230;
    return 260;
  }
  if (/(大とろ|うに|あわび)/.test(name)) {
    return 260;
  }
  if (name.includes("一貫") || /(中とろ|生サーモン|真鯛|ジャンボとろサーモン|大えび|ぶりとろ|上あなご)/.test(name)) {
    return 180;
  }
  return 120;
}

function parseKurasushiItems(text: string): Omit<ItemRecord, "id">[] {
  const items: Omit<ItemRecord, "id">[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    const match = line.match(/^(.*?)\s+(\d{1,3})\s+(?:●|▲|-)/);
    if (!match) {
      continue;
    }

    const name = cleanDisplayName(match[1] ?? "");
    if (
      !name ||
      shouldIgnoreStandaloneName(name) ||
      /(限定|対象|エリア|替え玉|セット|持ち帰り|コンボ|シャリなし|お魚だけシリーズ|食後の一皿)/.test(name) ||
      /(コーヒー|珈琲|ラテ|コーラ|緑茶|サイダー|ハイボール|梅酒|ビール|ウォーター|ドリンク|オレンジ|りんご|巨峰|ぶどう|カフェ|ゼロ|ホット)/.test(name)
    ) {
      continue;
    }

    const category = inferSushiCategory(name);
    const calories = Number(match[2] ?? "0");
    const estimated = estimateSushiNutrition(category, calories, name.includes("一貫"));
    items.push(
      makeItem({
        chainId: "kurasushi",
        name,
        category,
        categoryGroup: category === "side" || category === "dessert" || category === "noodle" ? "side" : "signature",
        price: estimateKuraPrice(name, category),
        calories,
        protein: estimated.protein,
        carbs: estimated.carbs,
        salt: estimated.salt,
      }),
    );
  }

  return dedupeItems(items);
}

async function parseHamazushiItems(text: string, scrapedTsvPath: string | URL): Promise<Omit<ItemRecord, "id">[]> {
  const items: Omit<ItemRecord, "id">[] = [];
  const scrapedEntries = parseHamazushiScrapedEntries(await readUtf8(scrapedTsvPath));
  const priceLookup = buildHamazushiPriceLookup(scrapedEntries);
  const excludedHamazushiNamePattern =
    /(コーヒー|珈琲|カフェラテ|ラテ|茶|コーラ|サイダー|ジュース|ウォーター|ビール|アルコール|ハイボール|オールフリー|ドリンク|レモンサワー|グレープフルーツサワー|梅酒|焼酎|冷酒|日本酒|晴雲|朝ラーメン|朝食メニュー)/;
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    const match = line.match(/^(.*?)\s+(\d{1,3})\s+(?:●|△|-)/);
    if (!match) {
      continue;
    }

    let name = cleanHamazushiName(match[1] ?? "");
    if (!name || shouldIgnoreStandaloneName(name) || /^(分類|おすすめ|にぎり|軍艦)$/.test(name)) {
      continue;
    }

    if (
      !name ||
      /(限定|対象|以外|店舗|エリア|セット|追加トッピング|サイドメニュー)/.test(name) ||
      excludedHamazushiNamePattern.test(name)
    ) {
      continue;
    }

    const key = normalizeHamazushiName(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const category = inferSushiCategory(name);
    const calories = Number(match[2] ?? "0");
    const estimated = estimateSushiNutrition(category, calories, name.includes("一貫"));
    const scrapedEntry = findHamazushiScrapedEntry(priceLookup, name, category);

    items.push(
      makeItem({
        chainId: "hamazushi",
        name,
        category,
        categoryGroup: category === "side" || category === "dessert" || category === "noodle" ? "side" : "signature",
        price: scrapedEntry?.price ?? estimateHamaPrice(name, category),
        calories,
        protein: estimated.protein,
        carbs: estimated.carbs,
        salt: estimated.salt,
      }),
    );
  }

  for (const entry of scrapedEntries) {
    if (excludedHamazushiNamePattern.test(entry.name)) {
      continue;
    }

    const key = normalizeHamazushiName(entry.name);
    if (seen.has(key)) {
      continue;
    }
    if (
      /(コーヒー|珈琲|ラテ|茶|コーラ|サイダー|ジュース|ウォーター|ビール|アルコール|ハイボール|ドリンク|レモンサワー|グレープフルーツサワー|梅酒|焼酎|冷酒|日本酒|晴雲|朝ラーメン|朝食|吟醸|生酒)/.test(
        entry.name,
      )
    ) {
      continue;
    }
    seen.add(key);

    const calories = estimateHamazushiCalories(entry.category);
    const estimated = estimateSushiNutrition(entry.category, calories, entry.name.includes("一貫"));
    items.push(
      makeItem({
        chainId: "hamazushi",
        name: entry.name,
        category: entry.category,
        categoryGroup: entry.category === "side" || entry.category === "dessert" || entry.category === "noodle" ? "side" : "signature",
        price: entry.price,
        calories,
        protein: estimated.protein,
        carbs: estimated.carbs,
        salt: estimated.salt,
      }),
    );
  }

  return dedupeItems(items);
}

function buildSushiroItems(tsvText: string): Omit<ItemRecord, "id">[] {
  const records = parseTabSeparated(tsvText);
  const items: Omit<ItemRecord, "id">[] = [];

  for (const record of records) {
    const name = cleanDisplayName(record.name ?? "");
    if (!name) {
      continue;
    }
    const price = Number(record.price ?? "0");
    const calories = Number(record.kcal ?? "0");
    const rawCategory = record.category ?? "";
    const category = mapSushiroOfficialCategory(rawCategory, name);

    if (
      !category ||
      rawCategory === "フェア商品" ||
      rawCategory === "お持ち帰りメニュー" ||
      rawCategory === "ドリンク" ||
      !Number.isFinite(price) ||
      !Number.isFinite(calories) ||
      (price >= 1 && price <= 10) ||
      calories === 0
    ) {
      continue;
    }

    let estimated: { protein: number; carbs: number; salt: number };
    if (category === "sushi" || category === "gunkan") {
      const protein = 4;
      const fat = 1;
      estimated = {
        protein,
        carbs: Math.max(0, round1((calories - protein * 4 - fat * 9) / 4)),
        salt: 0.3,
      };
    } else if (category === "noodle") {
      const protein = 15;
      const fat = 8;
      estimated = {
        protein,
        carbs: Math.max(0, round1((calories - protein * 4 - fat * 9) / 4)),
        salt: 5.0,
      };
    } else if (category === "side") {
      const protein = 8;
      const fat = 5;
      estimated = {
        protein,
        carbs: Math.max(0, round1((calories - protein * 4 - fat * 9) / 4)),
        salt: 1.0,
      };
    } else {
      const protein = 3;
      const fat = 5;
      estimated = {
        protein,
        carbs: Math.max(0, round1((calories - protein * 4 - fat * 9) / 4)),
        salt: 0.1,
      };
    }

    items.push(
      makeItem({
        chainId: "sushiro",
        name,
        category: category as ItemRecord["category"],
        categoryGroup: category === "sushi" || category === "gunkan" ? "signature" : "side",
        price,
        calories,
        protein: estimated.protein,
        carbs: estimated.carbs,
        salt: estimated.salt,
      }),
    );
  }

  return dedupeItems(items);
}

function inferSukiyaCategory(name: string): { category: string; categoryGroup: "signature" | "side" } {
  if (/(朝食|朝定食|牛まぜのっけ|たまかけ|鮭朝食)/.test(name)) {
    return { category: "breakfast", categoryGroup: "signature" };
  }
  if (name.includes("カレー")) {
    return { category: "curry", categoryGroup: "signature" };
  }
  if (name.includes("定食")) {
    return { category: "set", categoryGroup: "signature" };
  }
  if (/(みそ汁|とん汁|サラダ|たまご|おしんこ|からあげ)/.test(name)) {
    return { category: "side", categoryGroup: "side" };
  }
  return { category: "bowl", categoryGroup: "signature" };
}

function estimateSukiyaPrice(name: string): number {
  const exact: Record<string, number> = {
    "おろしポン酢牛丼": 690,
    "とろ〜り3種のチーズ牛丼": 690,
    "山かけ牛丼": 690,
    "かつぶしオクラ牛丼": 690,
    "高菜明太マヨ牛丼": 690,
    "にんにくファイヤー牛丼": 690,
    "牛丼ライト": 580,
    "おんたまカレー": 690,
    "まぐろユッケ丼": 790,
    "鮭納豆定食": 690,
    "牛カルビ定食": 890,
    "とん汁": 240,
    "たまご": 90,
    "サラダ": 180,
    "みそ汁": 110,
    "からあげ2個": 220,
    "たまかけ朝食": 390,
    "牛まぜのっけ朝食": 450,
    "鮭朝食": 490,
  };
  return exact[name] ?? 650;
}

function estimateSukiyaSalt(name: string, category: string): number {
  if (name.includes("牛丼")) return 2.5;
  if (category === "curry") return 3.0;
  if (category === "set" || category === "breakfast") return 2.8;
  if (name.includes("みそ汁") || name.includes("とん汁")) return 1.5;
  return 0.3;
}

function shouldExpandSukiyaSizes(name: string, category: ReturnType<typeof inferSukiyaCategory>): boolean {
  return (
    category.categoryGroup === "signature" &&
    category.category !== "set" &&
    category.category !== "breakfast" &&
    !/^お子様/.test(name) &&
    !name.includes("ライト")
  );
}

function buildSukiyaItems(tsvText: string, priceMap: Map<string, PriceEntry>): Omit<ItemRecord, "id">[] {
  const records = parseTabSeparated(tsvText);
  const items: Omit<ItemRecord, "id">[] = [];

  for (const record of records) {
    const rawName = normalizeTilde(record.name ?? "");
    const name = cleanDisplayName(rawName);
    if (!name || /ミニ|並盛|中盛|大盛|特盛|メガ/.test(name)) {
      continue;
    }

    const category = inferSukiyaCategory(name);
    const calories = Number(record.calories ?? "0");
    const protein =
      record.protein === "null" || record.protein === "" ? null : Number(record.protein);
    const fat = record.fat === "null" || record.fat === "" ? null : Number(record.fat);
    const carbs =
      record.carbs === "null" || record.carbs === ""
        ? protein !== null && fat !== null
          ? round1(Math.max(0, (calories - protein * 4 - fat * 9) / 4))
          : null
        : Number(record.carbs);
    const salt =
      record.salt === "null" || record.salt === "" ? estimateSukiyaSalt(name, category.category) : Number(record.salt);
    const normalizedName = normalizeMatchName(name);
    const priceEntry =
      priceMap.get(`${normalizedName}:並盛`) ??
      priceMap.get(normalizeMatchName(`${name}(並盛)`)) ??
      priceMap.get(normalizedName) ??
      [...priceMap.entries()].find(([key]) => key.includes(normalizedName))?.[1];
    const basePrice = name === "牛丼" ? 480 : priceEntry?.price ?? estimateSukiyaPrice(name);

    if (shouldExpandSukiyaSizes(name, category)) {
      for (const size of SUKIYA_SIZE_ORDER) {
        const multiplier = SUKIYA_SIZE_NUTRITION_MULTIPLIERS[size];
        items.push(
          makeItem({
            chainId: "sukiya",
            name: formatSizedName(name, size),
            category: category.category,
            categoryGroup: category.categoryGroup,
            price: basePrice + SUKIYA_SIZE_PRICE_ADJUSTMENTS[size],
            calories: Math.round(calories * multiplier),
            protein: scaleNullable(protein, multiplier),
            carbs: scaleNullable(carbs, multiplier),
            salt: scaleNullable(salt, multiplier),
          }),
        );
      }
      continue;
    }

    items.push(
      makeItem({
        chainId: "sukiya",
        name,
        category: category.category,
        categoryGroup: category.categoryGroup,
        price: basePrice,
        calories,
        protein,
        carbs,
        salt,
      }),
    );
  }

  return dedupeItems(items);
}

function dedupeItems(items: Omit<ItemRecord, "id">[]): Omit<ItemRecord, "id">[] {
  const next = new Map<string, Omit<ItemRecord, "id">>();
  for (const item of items) {
    const key = normalizeMatchName(item.name);
    if (!next.has(key)) {
      next.set(key, item);
    }
  }
  return [...next.values()];
}

function assignIds(items: Omit<ItemRecord, "id">[]) {
  const counters = new Map<string, number>();
  return items.map((item) => {
    const prefix = CHAIN_PREFIX[item.chainId] ?? item.chainId;
    const count = (counters.get(item.chainId) ?? 0) + 1;
    counters.set(item.chainId, count);
    return {
      ...item,
      id: `${prefix}-${String(count).padStart(3, "0")}`,
    };
  });
}

function sortItems(items: Omit<ItemRecord, "id">[]) {
  const order = new Map(CHAIN_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const chainOrder = (order.get(a.chainId) ?? 999) - (order.get(b.chainId) ?? 999);
    if (chainOrder !== 0) {
      return chainOrder;
    }
    return a.price - b.price || a.calories - b.calories || a.name.localeCompare(b.name, "ja");
  });
}

function withPriceKeys(priceMap: Map<string, PriceEntry>) {
  const next = new Map<string, PriceEntry>();
  for (const entry of priceMap.values()) {
    next.set(normalizeMatchName(entry.rawName), entry);
    next.set(normalizeMatchName(entry.displayName), entry);
    next.set(`${normalizeMatchName(entry.displayName)}:single`, entry);
    next.set(`${normalizeMatchName(entry.displayName)}:並盛`, entry);
  }
  return next;
}

const baseDataset = JSON.parse(await readFile(DATASET_PATH, "utf8")) as Dataset;
const priceSections = parsePriceSections(await readUtf8("/tmp/prices_collected.txt"));

const yoshinoyaItems = buildYoshinoyaItems(
  priceSections.get("吉野家") ?? new Map(),
  await readUtf8("/tmp/yoshinoya_nutrition.txt"),
);
const matsuyaItems = buildMatsuyaItems(
  withPriceKeys(priceSections.get("松屋") ?? new Map()),
  await readUtf8("/tmp/matsuya_nutrition.txt"),
);
const mcdonaldsPricePdfText = await readUtf8("/tmp/mcdonalds_prices.txt");
const mcdonaldsItems = buildMcdonaldsItems(
  await readUtf8("/tmp/mcdonalds_nutrition_web.tsv"),
  parseMcdonaldsPricePdf(mcdonaldsPricePdfText),
);
const sushiroItems = buildSushiroItems(await readUtf8("/tmp/sushiro_official_web.tsv"));
const kurasushiItems = parseKurasushiItems(await readUtf8("/tmp/kurasushi_nutrition.txt"));
const hamazushiItems = await parseHamazushiItems(await readUtf8("/tmp/hamazushi_nutrition.txt"), HAMAZUSHI_SCRAPED_PATH);
const cocoichiItems = buildCocoichiItems(
  priceSections.get("CoCo壱番屋") ?? new Map(),
  await readUtf8("/tmp/cocoichi_nutrition.txt"),
);
const sukiyaItems = buildSukiyaItems(
  await readUtf8("/tmp/sukiya_nutrition_web.tsv"),
  withPriceKeys(priceSections.get("すき家") ?? new Map()),
);

const saizeriyaItems = baseDataset.items.filter((item) => item.chainId === "saizeriya");
const activeItems = [
  ...yoshinoyaItems,
  ...matsuyaItems,
  ...mcdonaldsItems,
  ...sushiroItems,
  ...kurasushiItems,
  ...hamazushiItems,
  ...cocoichiItems,
  ...sukiyaItems,
];

const rebuiltDataset: Dataset = {
  metadata: {
    ...baseDataset.metadata,
    updatedAt: TARGET_DATE,
  },
  chains: baseDataset.chains.map((chain) => ({
    ...chain,
    updatedAt: ACTIVE_CHAIN_IDS.has(chain.id) ? TARGET_DATE : chain.updatedAt,
    scrapeDate: ACTIVE_CHAIN_IDS.has(chain.id) ? TARGET_DATE : chain.scrapeDate,
    nutrientReliability: RELIABILITY[chain.id] ?? chain.nutrientReliability,
  })),
  items: assignIds(sortItems([...saizeriyaItems, ...activeItems])),
};

await writeFile(DATASET_PATH, `${JSON.stringify(rebuiltDataset, null, 2)}\n`, "utf8");

const counts = Object.fromEntries(
  CHAIN_ORDER.map((chainId) => [chainId, rebuiltDataset.items.filter((item) => item.chainId === chainId).length]),
);
console.log(JSON.stringify(counts, null, 2));
