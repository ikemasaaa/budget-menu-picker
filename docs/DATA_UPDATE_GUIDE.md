# menu-dataset データ更新ガイド

最終確認日: 2026-04-06

## 目的

`data/menu-dataset.json` を次回更新するときに、各チェーンの入力ソース、更新手順、壊れやすいポイントをすぐ確認できるようにするための手順書。

このリポジトリでは `scripts/rebuild-menu-dataset.ts` が更新の起点で、以下のチェーンを再生成する。

- 吉野家 (`yoshinoya`)
- 松屋 (`matsuya`)
- マクドナルド (`mcdonalds`)
- スシロー (`sushiro`)
- くら寿司 (`kurasushi`)
- はま寿司 (`hamazushi`)
- CoCo壱番屋 (`cocoichi`)
- すき家 (`sukiya`)

`saizeriya` は再生成対象ではなく、既存の `data/menu-dataset.json` の item をそのまま残す。

## まず確認するもの

更新作業の前に、最低でも次を確認する。

- `scripts/rebuild-menu-dataset.ts`
- `data/menu-dataset.json`
- `/tmp/prices_collected.txt`
- 各チェーンの `/tmp/*.txt` または `/tmp/*.tsv`

現在の再ビルド入力は次のとおり。

| チェーン | 栄養・商品入力 | 価格入力 | 信頼度 |
| --- | --- | --- | --- |
| 吉野家 | `/tmp/yoshinoya_nutrition.txt` | `/tmp/prices_collected.txt` の `=== 吉野家 価格 (税込) ===` | calories/protein/carbs/salt は official |
| 松屋 | `/tmp/matsuya_nutrition.txt` | `/tmp/prices_collected.txt` の `=== 松屋 価格 (税込) ===` | official |
| マクドナルド | `/tmp/mcdonalds_nutrition_web.tsv` | `/tmp/mcdonalds_prices.txt` | official |
| スシロー | `/tmp/sushiro_official_web.tsv` | 同上 | calories は official、protein/carbs/salt は estimated |
| くら寿司 | `/tmp/kurasushi_nutrition.txt` | スクリプト内推定 | calories は official、protein/carbs/salt は estimated |
| はま寿司 | `/tmp/hamazushi_nutrition.txt` | スクリプト内推定 | calories は official、protein/carbs/salt は estimated |
| CoCo壱番屋 | `/tmp/cocoichi_nutrition.txt` | `/tmp/prices_collected.txt` の `=== CoCo壱番屋 価格 (税込) ===` | official |
| すき家 | `/tmp/sukiya_nutrition_web.tsv` | `/tmp/prices_collected.txt` の `=== すき家 価格 (税込) ===` | estimated |

## 共通の更新手順

1. 取得元の PDF または Web から最新データを集める。
2. 必要なら `pdftotext -layout` でテキスト化し、`/tmp/*.txt` に置く。
3. 価格を使うチェーンは `/tmp/prices_collected.txt` を更新する。
4. `scripts/rebuild-menu-dataset.ts` の `TARGET_DATE` を更新する。
5. ソースのレイアウト変更があれば、対象チェーンのビルド関数を修正する。
6. `npx tsx scripts/rebuild-menu-dataset.ts` を実行する。
7. `node --test tests/search.test.ts` を実行する。
8. `git diff` で `data/menu-dataset.json` と関連コードの差分を確認する。
9. 問題なければコミットする。

補足:

- `scripts/rebuild-menu-dataset.ts` は最後にチェーン別 item 件数を JSON で出力する。件数の急増・急減は見落としのサイン。
- `parsePriceSections()` は `/tmp/prices_collected.txt` を `=== チェーン名 価格 (税込) ===` と `# セクション名` で区切って読む。単純な TSV ではない。
- `ACTIVE_CHAIN_IDS` に入っているチェーンは `updatedAt` と `scrapeDate` が `TARGET_DATE` で上書きされる。

## チェーン別ガイド

### 吉野家 (`yoshinoya`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式栄養成分PDF (2026-04-02) を反映`
- `sourceUrl: https://www.yoshinoya.com/menu/`
- 栄養テキストの冒頭に `吉野家 メニュー情報 Y244号 2026年4月2日現在` とある

データソース:

- 栄養: 公式 PDF を `pdftotext -layout` で抽出した `/tmp/yoshinoya_nutrition.txt`
- PDF 導線: `https://www.yoshinoya.com/menu/` から栄養・アレルギー PDF に進む。既存調査では `https://www.yoshinoya.com/pdf/allergy/`
- 価格: `/tmp/prices_collected.txt` の吉野家セクション

更新頻度の目安:

- PDF の発行日が変わったタイミングで更新する
- 運用上は月1回確認、または PDF 差し替え時に更新でよい

更新手順:

1. 最新 PDF を取得する。
2. `pdftotext -layout <pdf> /tmp/yoshinoya_nutrition.txt` で整形テキストを作る。
3. 吉野家メニュー価格も変わっていれば `/tmp/prices_collected.txt` の吉野家セクションを更新する。
4. `buildYoshinoyaItems()` の結果を確認し、取りこぼしがあれば別名や合成レシピを追加する。

注意点:

- サイズ展開は `小盛 / 並盛 / アタマの大盛 / 大盛 / 特盛 / 超特盛` を前提にしている。
- 価格は `YOSHINOYA_SIZE_PRICE_ADJUSTMENTS` でサイズ差分を加算している。
- `肉だく牛丼`、`ねぎ玉牛丼`、`チーズ牛丼` などは `YOSHINOYA_COMPOSITION_RECIPES` で栄養を合成している。
- PDF 上の表記揺れは `YOSHINOYA_ALIASES` で吸収している。新メニューで一致しなければここを追加修正する。
- `弁当`、`ファミリーパック`、`三人前`、`四人前` は除外している。

### 松屋 (`matsuya`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式メニューページ・公式栄養情報を反映`
- `sourceUrl: https://www.matsuyafoods.co.jp/matsuya/service/nutrition.html`
- 栄養テキストの冒頭に `2026年3月31日` とある

データソース:

- 栄養: 公式栄養 PDF をテキスト化した `/tmp/matsuya_nutrition.txt`
- PDF 導線: `https://www.matsuyafoods.co.jp/matsuya/service/nutrition.html`
- 価格: `/tmp/prices_collected.txt` の松屋セクション

更新頻度の目安:

- PDF 側に「商品の改良・規格変更等に伴い随時更新」とあるため、月1回確認を基本にする
- URL が変わりやすいので、PDF の直リンク固定ではなく導線ページから探す

更新手順:

1. 栄養ページから最新 PDF を取得する。
2. `pdftotext -layout` で `/tmp/matsuya_nutrition.txt` を作る。
3. 価格変更があれば `/tmp/prices_collected.txt` の松屋セクションも更新する。
4. レイアウトが変わっていたら `buildMatsuyaItems()` のフィルタと価格解決を見直す。

注意点:

- PDF 注記どおり、メインメニューの栄養値には `みそ汁` が含まれる。
- サイズ展開は `小盛 / 並盛 / あたま大盛 / 大盛 / 特盛` を前提にしている。
- `withPriceKeys()` と `MATSUYA_SIZE_PRICE_ADJUSTMENTS` でサイズ別価格を作る。
- 価格が拾えないと `estimateMatsuyaPrice()` の推定に落ちる。新商品が多いと精度が落ちるので、まず価格テキストを更新する。
- 沖縄注記、ドリンク、調味料、ファミリー系メニューは除外している。

### すき家 (`sukiya`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式メニューページの価格・FatSecret/EatSmart等の栄養参考値を含む`
- `sourceUrl: https://www.sukiya.jp/menu/`
- `nutrientReliability` はすべて `estimated`

データソース:

- 栄養: `/tmp/sukiya_nutrition_web.tsv`
- 価格: `/tmp/prices_collected.txt` のすき家セクション
- 公式の公開 PDF は `https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf` だが、中身はアレルゲン一覧で、現行ビルドの栄養入力には使っていない

更新頻度の目安:

- 公式栄養値がないため、メニュー改定や価格改定のたびに更新判断が必要
- 運用上は月1回確認、または価格改定・主力メニュー改定時に更新

更新手順:

1. 価格を `https://www.sukiya.jp/menu/` から確認し、`/tmp/prices_collected.txt` を更新する。
2. 参考栄養 TSV を更新し、`/tmp/sukiya_nutrition_web.tsv` を差し替える。
3. 公式 PDF も確認し、商品名や期間限定導線に変化がないかを見る。
4. `buildSukiyaItems()` のサイズ展開結果を確認する。

注意点:

- `carbs` は `protein` と `fat` から逆算することがある。
- `salt` は未提供時に `estimateSukiyaSalt()` を使う。
- サイズ展開は `ミニ / 並盛 / 中盛 / 大盛 / 特盛 / メガ` を前提に `SUKIYA_SIZE_NUTRITION_MULTIPLIERS` で比率推定する。
- `牛丼ライト`、朝食、定食は通常のサイズ展開をしない。
- 価格が拾えない場合は `estimateSukiyaPrice()` に落ちるので、実価格との差が出やすい。

### マクドナルド (`mcdonalds`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式メニュー・公式栄養成分一覧を反映`
- `sourceUrl: https://www.mcdonalds.co.jp/quality/allergy_Nutrition/nutrient/`
- 栄養入力は `/tmp/mcdonalds_nutrition_web.tsv`
- 価格入力は `/tmp/mcdonalds_prices.txt`

データソース:

- 栄養: 公式サイトの栄養バランスチェック由来 TSV
- 価格: 価格改定 PDF をテキスト化した `/tmp/mcdonalds_prices.txt`

更新頻度の目安:

- 価格改定が頻繁なので、栄養より価格の追随を優先する
- 月1回確認よりも、価格改定告知のたびに更新する運用が安全

更新手順:

1. 栄養一覧または栄養バランスチェックから最新 TSV を作り、`/tmp/mcdonalds_nutrition_web.tsv` を更新する。
2. 最新の価格改定 PDF を取得してテキスト化し、`/tmp/mcdonalds_prices.txt` を更新する。
3. PDF の表記が変わったら `parseMcdonaldsPricePdf()` のパターンを修正する。
4. 新商品や価格未掲載品が多ければ `MCDONALDS_PRICE_OVERRIDES` も見直す。

注意点:

- 価格は `MCDONALDS_PRICE_OVERRIDES` を最優先し、その次に PDF 抽出値を使う。
- それでも取れない商品は `estimateMcdonaldsPrice()` に落ちる。
- 栄養 TSV からはドリンク、McCafe、一部季節商品、`倍` 系を除外している。
- 商品名の正規化は `normalizeMcdonaldsName()` が担う。表記揺れが変わると重複や取りこぼしが出る。

### CoCo壱番屋 (`cocoichi`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式栄養成分PDF・公式メニューページから取得`
- `sourceUrl: https://www.ichibanya.co.jp/menu/pdf/nutrition.pdf`
- 栄養テキストの冒頭に `2026年3月19日現在` とある

データソース:

- 栄養: 公式 PDF をテキスト化した `/tmp/cocoichi_nutrition.txt`
- 価格: `/tmp/prices_collected.txt` の CoCo壱番屋セクション

更新頻度の目安:

- PDF 側に「情報は随時更新」とあるため、月1回確認を基本にする
- 期間限定カレー入れ替え時は臨時確認する

更新手順:

1. 最新 PDF を取得し、`pdftotext -layout` で `/tmp/cocoichi_nutrition.txt` を更新する。
2. 価格変更があれば `/tmp/prices_collected.txt` の CoCo壱番屋セクションを更新する。
3. `buildCocoichiItems()` の突合結果を見て、名前が合わないメニューがないか確認する。

注意点:

- 既存ビルドは通常カレー中心で、`ライス量「普通(300g)」` の行を基準に使う。
- スープカレー、うどん、らーめん、ドリア、ミニ、トッピング、ドリンクは除外している。
- 価格が拾えない一部定番商品は `COCOICHI_PRICE_ESTIMATES` で補完する。
- `低糖質カレー` は PDF の特殊レイアウトを `parseCocoichiNutrition()` 側で個別処理している。

### くら寿司 (`kurasushi`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式PDF (2026-04-03) カロリー反映。炭水化物・食塩は酢飯ベース推定値`
- `sourceUrl: https://www.kurasushi.co.jp/menu/`
- 栄養テキストの冒頭に `2026年4月3日現在` とある

データソース:

- 栄養: 公式アレルゲン PDF をテキスト化した `/tmp/kurasushi_nutrition.txt`
- カロリーだけを使い、`protein/carbs/salt` はスクリプト内推定
- 価格も `estimateKuraPrice()` による推定

更新頻度の目安:

- PDF 側に「データは日々更新」とあるので、月1回確認を基本にする
- 定番商品の価格帯変更が見えたときは `estimateKuraPrice()` も見直す

更新手順:

1. 公式 PDF を取得し、`pdftotext -layout` で `/tmp/kurasushi_nutrition.txt` を更新する。
2. `parseKurasushiItems()` の正規表現で kcal が拾えているか確認する。
3. 価格帯や一貫商品の扱いが変わっていれば `estimateKuraPrice()` を修正する。

注意点:

- 現在のビルドは `name + kcal + 記号` の行だけを拾う。
- `限定`、`セット`、`持ち帰り`、`ドリンク` などは除外している。
- `inferSushiCategory()` と `estimateSushiNutrition()` の推定は寿司チェーン共通ロジック。
- `一貫` の文字を含む商品は単価・栄養推定が別扱いになる。

### はま寿司 (`hamazushi`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: 公式PDF (2026-04-01) カロリー反映。炭水化物・食塩は酢飯ベース推定値`
- `sourceUrl: https://www.hama-sushi.co.jp/menu/`
- 栄養テキストの冒頭に `更新日 2026/4/1` とある

データソース:

- 栄養: 公式アレルゲン PDF をテキスト化した `/tmp/hamazushi_nutrition.txt`
- 公式 PDF 取得元は Zensho 系ドメイン配下の PDF もありうるが、現行ビルド入力はテキスト化済みファイル
- カロリーだけを使い、`protein/carbs/salt` はスクリプト内推定
- 価格は `estimateHamaPrice()` による推定

更新頻度の目安:

- PDF 側に「アレルゲン情報は随時更新」とあるため、月1回確認を基本にする
- 価格帯改定があれば `estimateHamaPrice()` も合わせて見直す

更新手順:

1. 公式 PDF を取得し、`pdftotext -layout` で `/tmp/hamazushi_nutrition.txt` を更新する。
2. `parseHamazushiItems()` でカテゴリ見出しや正規表現が崩れていないか確認する。
3. 価格帯が変わっていれば `estimateHamaPrice()` を修正する。

注意点:

- 現在のパーサは `● / △ / -` が続く行から `name` と `kcal` を読む。
- `おすすめ`、`にぎり`、`軍艦` の見出し語を前処理で落としている。
- `限定`、`エリア`、`ドリンク`、`追加トッピング` は除外している。

### スシロー (`sushiro`)

現状:

- `data/menu-dataset.json` では `updatedAt: 2026-04-06`
- `sourceLabel: Webリサーチによる参考値。炭水化物・食塩は酢飯ベース推定値`
- `sourceUrl: https://www.akindo-sushiro.co.jp/menu/menu_detail/`
- 現在の入力は `/tmp/sushiro_official_web.tsv`

データソース:

- 公式サイトの店舗別メニューページを使う
- 参考 URL: `https://www.akindo-sushiro.co.jp/menu/menu_detail/?s_id=0579`
- 取得 DOM: `.menu-item__name`, `.menu-item__price`, `.menu-item__calorie`
- 入力 TSV は `name / price / kcal / category` の4列
- `protein/carbs/salt` は `buildSushiroItems()` 内で推定

更新頻度の目安:

- フェア商品の入れ替えが多いので、価格・商品入れ替えがあったら随時更新する
- 定番メニューだけを見るなら月1回確認でもよいが、鮮度重視ならもっと短く見る

更新手順:

1. 代表店舗を1つ決めて公式メニューを開く。
2. DOM から `name / price / kcal / category` を取得し、`/tmp/sushiro_official_web.tsv` を更新する。
3. `buildSushiroItems()` を実行し、カテゴリ判定と除外条件が現行 DOM に合っているか確認する。

注意点:

- `フェア商品`、`お持ち帰りメニュー`、`ドリンク` は除外している。
- `price` が `1` から `10` の行や `kcal = 0` は除外している。公式ページ上の人前セットやダミー値対策。
- カテゴリは `にぎり / 軍艦・巻物 / サイドメニュー / デザート` を `mapSushiroOfficialCategory()` で内部カテゴリに変換している。
- `protein/carbs/salt` はカテゴリごとに固定前提で推定しているため、厳密な栄養更新ではない。

## 変更が入りやすい箇所

- `TARGET_DATE`
- `/tmp/prices_collected.txt`
- `YOSHINOYA_ALIASES`
- `YOSHINOYA_COMPOSITION_RECIPES`
- `MCDONALDS_PRICE_OVERRIDES`
- `MCDONALDS_PDF_PATTERNS`
- `COCOICHI_PRICE_ESTIMATES`
- `estimateKuraPrice()`
- `estimateHamaPrice()`
- `estimateSukiyaPrice()`
- `SUKIYA_SIZE_NUTRITION_MULTIPLIERS`

## 更新後の確認ポイント

- `metadata.updatedAt` が更新されているか
- 各 active chain の `updatedAt` と `scrapeDate` が `TARGET_DATE` になっているか
- `sourceLabel` と `nutrientReliability` が意図どおりか
- item 件数が不自然に減っていないか
- 価格が推定値に落ちすぎていないか
- サイズ展開メニューの価格差と栄養差が自然か
