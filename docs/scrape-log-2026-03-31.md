# メニューデータ取得メモ

作成日: 2026-03-31

## 取得方針

- 公式サイト・公式栄養情報を優先して確認した。
- 価格・カロリー・タンパク質の全てを確認できた項目は JSON を更新した。
- 一部項目は価格またはカロリーのみ公式確認できたため、未取得項目は既存の手動参考値を残した。

## チェーン別結果

### サイゼリヤ

- 確認 URL: https://www.saizeriya.co.jp/menu/
- 結果: 商品ページの確認は可能だが、今回の取得経路では価格・カロリー・タンパク質の一括確認が難しかった。
- 対応: 既存の手動参考値を維持。

### 吉野家

- 確認 URL: https://www.yoshinoya.com/menu/
- 結果: 商品ページから価格は確認できたが、栄養成分一覧の機械取得が難しかった。
- 対応: 一部価格を更新し、カロリー・タンパク質は既存の手動参考値を維持。

### 松屋

- 確認 URL: https://www.matsuyafoods.co.jp/matsuya/service/nutrition.html
- 結果: 複数商品の価格・カロリー・タンパク質を公式ページから確認できた。
- 対応: 取得できた商品を公式値へ更新。未取得項目は既存の手動参考値を維持。

### マクドナルド

- 確認 URL: https://www.mcdonalds.co.jp/quality/allergy_Nutrition/nutrient/
- 結果: 栄養成分一覧からカロリー・タンパク質を確認でき、商品ページ・メニュー一覧から価格も確認できた。
- 対応: 10品を公式値へ更新。

### スシロー

- 確認 URL: https://www.akindo-sushiro.co.jp/menu/menu_detail/
- 結果: メニュー一覧から価格・カロリーは確認できたが、タンパク質は今回の取得経路では十分に確認できなかった。
- 対応: 一部価格・カロリーを更新し、タンパク質は既存の手動参考値を維持。

### くら寿司

- 確認 URL: https://www.kurasushi.co.jp/menu/
- 結果: 今回の取得経路では価格・カロリー・タンパク質の安定取得が難しかった。
- 対応: 既存の手動参考値を維持。

### はま寿司

- 確認 URL: https://www.hama-sushi.co.jp/menu/
- 結果: 今回の取得経路では価格・カロリー・タンパク質の安定取得が難しかった。
- 対応: 既存の手動参考値を維持。

## Playwright 再試行メモ

- 実施日: 2026-03-31
- 目的: サイゼリヤ・くら寿司・はま寿司を Playwright の headless Chromium で再取得する。
- 結果: この作業セッションでは外部 DNS 解決ができず、`npm install -D playwright @playwright/test` は `ENOTFOUND registry.npmjs.org`、`curl https://www.saizeriya.co.jp/nutrition/` は `Could not resolve host` で失敗した。
- 影響: `npx playwright install chromium` と各スクレイピングスクリプトの実行は成立せず、取得 JSON は失敗ログのみ保存した。
- 対応: `scripts/scrape-*.ts` と `scripts/merge-playwright-scrapes.ts` を追加し、オンライン環境でそのまま再試行できる状態にした。
