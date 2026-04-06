# Budget Menu Picker v2 実装計画

> codex 向け実装仕様書。Claude Code が設計、codex が実装する。

## 概要

MVP からの大規模リニューアル。3 本柱：
1. **UI 刷新** — 白ベース・ミニマル、レンジスライダー、単一チェーン選択
2. **栄養データ拡張** — カロリー/タンパク質 → カロリー/タンパク質/炭水化物/塩分 の 4 栄養素
3. **チェーン拡充** — 4 → 最大 13 チェーン対応

---

## 現状ファイル構成（変更対象）

```
src/
  main.ts           # render() + イベントバインド（317行、innerHTML全置換）
  styles.css         # 暖色グラデーション系（462行）
  lib/
    types.ts         # Chain, MenuItem, constraintDefs, SearchInput 等
    search.ts        # DFS 探索（272行）
    chain-selection.ts  # status=active フィルタ
    url-state.ts     # URLクエリ ↔ state 同期
data/
  menu-dataset.json  # chains[] + items[]
tests/
  search.test.ts     # 5テスト
```

---

## Phase 1: UI リニューアル

### 1-1. デザイン方針

参考: 「服ガチャ」アプリ（白ベース、大きな丸ボタン、リスト結果表示）

- **配色**: 白ベース、モノトーン。アクセントは黒 or 控えめな 1 色
- **レイアウト**: 1 カラム、モバイルファースト
- **情報量**: 最小限。hero → 1 行タイトル、探索サマリー → 削除、データ出典 → 折りたたみ

### 1-2. チェーン選択を単一に変更

**理由**: チェーンごとに栄養データの信頼度（公式/推定）が異なるため、
複数選択すると結果の ※推定 表示がカード内でバラバラになり混乱する。

```
チェーンを選ぶ
[吉野家] [松屋] [マック] [スシロー] ...   ← ピル型ラジオ（1つだけ選択）
```

**変更箇所**:
- `QueryState.chains: string[]` → `QueryState.chainId: string`（単一）
- `SearchInput.chainIds: string[]` → `SearchInput.chainId: string`
- `search.ts` のフィルタを `chainIds.includes()` → `=== chainId`
- `url-state.ts` の `chains=a,b` → `chain=sushiro`
- `chain-selection.ts` は selectable チェーン一覧の提供のみに簡素化
- `main.ts` のチェックボックス → ラジオボタン（ピル型）

### 1-3. レンジスライダー（dual range）

各制約（予算/カロリー/タンパク質/炭水化物/塩分）に対して：

```
予算
[500] ────●━━━━━━━━━━●──── [3000] 円
 min入力   min thumb  max thumb   max入力
```

- `<input type="range">` × 2（min/max）をオーバーレイ
- 両端に `<input type="number">`（テキストボックス）
- range ↔ number 双方向同期
- CSS: `-webkit-slider-thumb` カスタマイズ、トラック色分け
- constraintDefs からループ生成（既存パターンを踏襲）

### 1-4. ガチャボタン

- 大きな正円ボタン（参考画像風）
- `border-radius: 50%; width: 160px; height: 160px;`
- 黒背景 + 白文字「ガチャる」
- ホバー/アクティブで軽い scale アニメーション

### 1-5. 結果表示

```
あなたのメニュー        ¥1,280
────────────────────────────
🟤 吉野家  牛丼並盛         ¥468
🔴 マック  チキンマック     ¥200
────────────────────────────
おつり ¥220
623kcal / 38g protein / 82g carbs / 3.2g salt
※カロリー・タンパク質は推定値です
────────────────────────────
[もう一回]  [Xでシェア]
```

- カードグリッド → 縦リスト
- 「おつり」= 予算上限 - 合計価格（予算上限未設定時は非表示）
- 4 栄養素の合計を 1 行で表示
- チェーンの `nutrientReliability` に `estimated` があれば ※推定 ラベル
- 「もう一回」「X でシェア」ボタン追加

### 1-6. セクション構成（render 内 HTML）

```html
<main>
  <!-- ヘッダー: 1行タイトル + サブテキスト -->
  <header>
    <h1>メニューガチャ</h1>
    <p>予算内でランダムメニューを組む</p>
  </header>

  <!-- チェーン選択: ピル型ラジオ -->
  <section class="chain-select">...</section>

  <!-- 店舗タイプ: priceTiers があるチェーンのみ表示 -->
  <section class="price-tier-select">...</section>

  <!-- 制約スライダー: 5 軸 -->
  <section class="constraints">
    <!-- constraintDefs.map → dual range slider -->
  </section>

  <!-- ガチャボタン -->
  <div class="gacha-trigger">
    <button type="submit">ガチャる</button>
  </div>

  <!-- 結果 -->
  <section class="results">...</section>

  <!-- フッター: データ出典（details/summary で折りたたみ） -->
  <footer>
    <details><summary>データ出典</summary>...</details>
  </footer>
</main>
```

### 1-7. CSS リライト方針

```css
:root {
  --bg: #ffffff;
  --surface: #f8f8f8;
  --ink: #1a1a1a;
  --muted: #888888;
  --accent: #000000;
  --border: #e5e5e5;
}
```

- グラデーション背景 → フラット白
- カード shadow → border のみ or 極薄 shadow
- border-radius 28px → 12px or 8px
- フォント: system-ui, "Hiragino Sans", sans-serif

---

## Phase 2: データモデル拡張

### 2-1. MenuItem に栄養素追加

```typescript
// 現状
type MenuItem = {
  id: string; chainId: string; name: string; category: string;
  price: number; calories: number; protein: number; tags: string[];
};

// 変更後
type MenuItem = {
  id: string; chainId: string; name: string; category: string;
  price: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;      // 追加
  salt: number | null;       // 追加（食塩相当量 g）
  tags: string[];
};
```

### 2-2. Chain に信頼度 + 価格帯追加

```typescript
type NutrientField = "calories" | "protein" | "carbs" | "salt";
type NutrientReliability = "official" | "estimated";

type PriceTier = {
  tierId: string;       // "suburban" | "semi-urban" | "urban"
  label: string;        // "郊外型" | "準都市型" | "都市型"
  priceMultiplier: number; // 基準価格に対する倍率
};

type Chain = {
  id: string;
  name: string;
  status: ChainStatus;
  updatedAt: string;
  scrapeDate: string;
  sourceLabel: string;
  sourceUrl: string;
  nutrientReliability: Record<NutrientField, NutrientReliability>;
  priceTiers?: PriceTier[];  // スシロー等のみ
};
```

### 2-3. constraintDefs 拡張

```typescript
export const constraintDefs = [
  { id: "budget",  label: "予算",       min: 0, max: 5000, step: 50, suffix: "円",   ... },
  { id: "calorie", label: "カロリー",   min: 0, max: 3000, step: 50, suffix: "kcal", ... },
  { id: "protein", label: "タンパク質", min: 0, max: 200,  step: 1,  suffix: "g",    ... },
  { id: "carbs",   label: "炭水化物",   min: 0, max: 500,  step: 5,  suffix: "g",    ... },  // 追加
  { id: "salt",    label: "塩分",       min: 0, max: 20,   step: 0.1, suffix: "g",   ... },  // 追加
] as const;
```

### 2-4. search.ts 拡張

`Totals` に `carbs`, `salt` を追加。
DFS の枝刈り・フィルタに炭水化物・塩分の上下限を追加。
`SearchResult` に `totalCarbs`, `totalSalt` を追加。

### 2-5. 価格帯の適用

`SearchInput` に `priceTierId?: string` を追加。
`searchMenus()` の eligible フィルタで、priceTier の multiplier を適用して実効価格を計算。
もしくは、main.ts 側でデータ読み込み時に選択された tier に基づいて `items[].price` を変換してから search に渡す（こちらが簡単）。

### 2-6. QueryState / url-state

```typescript
type QueryState = ConstraintState & {
  chainId: string;        // 単一チェーン
  priceTierId?: string;   // 価格帯（あれば）
};
```

URL: `?chain=sushiro&tier=suburban&budgetMax=1000&calorieMax=800`

---

## Phase 3: 新チェーン追加

### 対象チェーン（優先順）

| 優先 | チェーン | chainId | データソース | 栄養素 |
|------|----------|---------|-------------|--------|
| S | 丸亀製麺 | marugame | kalori.jp 105品 | PFC+塩分 |
| S | ガスト | gusto | kalori.jp 162品 | PFC+塩分 |
| A | CoCo壱番屋 | cocoichi | 公式PDF | PFC+塩分 |
| A | 日高屋 | hidakaya | 公式サイト | PFC+塩分 |
| A | 魚べい | uobei | 公式PDF + kalori 222品 | PFC+塩分(要確認) |
| B | 餃子の王将 | ohsho | kalori 76品 | PFC+塩分 |
| B | なか卯 | nakau | 公式PDF | PFC+塩分 |
| B | すき家 | sukiya | 公式サイト | PFC+塩分 |

### スクレイピング方針

各チェーンごとに `scripts/scrape-{chainId}.ts` を作成。
データソースに応じて：

1. **公式PDF** (CoCo壱, なか卯, 魚べい): PDF → テキスト抽出 → パース
2. **公式HTML** (日高屋, すき家): Playwright で公式ページをスクレイプ
3. **kalori.jp** (丸亀, ガスト, 王将): kalori.jp の商品ページをスクレイプ
   - 注意: kalori.jp は非公式サイト。利用規約確認要

出力は `scripts/scraped/{chainId}.json` に統一フォーマットで保存。
`scripts/merge-playwright-scrapes.ts` で `data/menu-dataset.json` にマージ。

### スシロー価格帯データ

スシローの各メニューに「皿色」（黄/赤/黒等）情報を付与し、
`priceTiers` で皿色ごとの価格マッピングを持つ。

```json
{
  "id": "sushiro",
  "priceTiers": [
    { "tierId": "suburban",   "label": "郊外型",   "platePrices": { "yellow": 120, "red": 180, "black": 260 } },
    { "tierId": "semi-urban", "label": "準都市型", "platePrices": { "yellow": 130, "red": 190, "black": 270 } },
    { "tierId": "urban",      "label": "都市型",   "platePrices": { "yellow": 150, "red": 210, "black": 290 } }
  ]
}
```

メニューアイテム側は `plateColor: "yellow"` を持ち、選択された tier の価格に変換。

---

## Phase 4: 既存スクレイパー修復

| チェーン | 問題 | 対応 |
|----------|------|------|
| サイゼリヤ | table セレクタ不一致 | サイト構造再調査、セレクタ修正 |
| くら寿司 | 栄養データ null | 公式に栄養情報なし → kalori.jp 補完 or 価格のみ対応 |
| はま寿司 | カード抽出 0 件 | サイト構造再調査、スクレイパー書き直し |

---

## 実装順序（codex タスク分割）

### Task 1: types.ts + search.ts 拡張（Phase 2 基盤）
```
cat src/lib/types.ts src/lib/search.ts tests/search.test.ts
```
- MenuItem に carbs, salt 追加（null 許容）
- Chain に nutrientReliability, priceTiers 追加
- constraintDefs に carbs, salt 追加
- ConstraintId, NumericFieldId, ConstraintState 型を自動拡張
- search.ts の Totals, DFS, 枝刈り, SearchResult に carbs/salt 追加
- QueryState.chains → QueryState.chainId に変更
- SearchInput.chainIds → SearchInput.chainId に変更
- テスト更新・追加

### Task 2: url-state.ts + chain-selection.ts 更新
```
cat src/lib/url-state.ts src/lib/chain-selection.ts src/lib/types.ts
```
- URL パラメータ: chains=a,b → chain=sushiro
- priceTierId パラメータ追加
- carbs/salt の min/max パラメータ追加
- chain-selection は selectable 一覧提供に簡素化

### Task 3: UI リニューアル（main.ts + styles.css）
```
cat src/main.ts src/styles.css src/lib/types.ts
```
- render() の HTML 構造を全面書き換え
- CSS を全面リライト（白ベース・ミニマル）
- チェーン選択: ピル型ラジオ（単一選択）
- レンジスライダー（dual range + 両端 number input）
- ガチャボタン: 大きな丸（黒背景白文字）
- 結果: リスト表示 + おつり + 4 栄養素合計 + ※推定ラベル
- 価格帯セレクター（priceTiers ありのチェーンのみ）
- データ出典: details/summary で折りたたみ
- 「もう一回」「X でシェア」ボタン
- bindEvents 更新

### Task 4: 既存データ更新（menu-dataset.json）
- 既存 4 チェーン（吉野家/松屋/マクドナルド/スシロー）に carbs, salt データ追加
- chains[] に nutrientReliability 追加
- スシローに priceTiers 追加

### Task 5〜: 新チェーン追加（各チェーンごと）
- スクレイパー作成 → scraped JSON → merge → dataset 反映 → テスト

---

## 制約・注意事項

- **既存テストは全パス維持**（`npm test`）
- **ビルド**: `npm run build` → `node scripts/build.ts`（Node 24 stripTypeScriptTypes）
- **バンドラーなし**: 素の TS → JS。外部ライブラリ追加は慎重に
- **アクセシビリティ**: aria-live, aria-invalid 等は維持
- **既存ロジックの本質は変えない**: DFS + backtracking、constraintDefs ループ生成パターン
