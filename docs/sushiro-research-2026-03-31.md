# スシロー調査メモ

作成日: 2026-03-31

## 方針

- 価格とカロリーはスシロー公式メニューを優先。
- タンパク質は公式メニュー上で確認しづらいため、`kalori` の各商品ページにある AI 推定値を参考値として採用。
- 推測を含む値:
  - `data/menu-dataset.json` のスシロー商品の `protein`
  - 上記はすべて `kalori` 側でも「推定」「AI β」と明記されている参考値

## 反映した商品と根拠

- サーモン: 120円 / 91kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 5.2g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1801/
- えび: 120円 / 72kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 4.8g
  - kalori: https://www.kalori.jp/ja/shops/sushiro/products/1805
- 赤えび: 120円 / 45kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 4.0g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1804/
- えんがわ: 140円 / 89kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 3.3g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1820/
- 生えび: 140円 / 68kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 4.5g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1821/
- コウイカ: 140円 / 70kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 4.8g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1829
- たまご: 120円 / 122kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 4.5g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1809/
- 小粒納豆軍艦: 120円 / 100kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 5.0g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1867/
- ねぎまぐろ軍艦: 120円 / 108kcal
  - 公式: https://www.akindo-sushiro.co.jp/apps/menu/menu_detail/?s_id=183
  - タンパク質参考値: 4.8g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1852/
- オニオンサーモン: 140円 / 118kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 5.4g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1819/
- 活〆はまち: 160円 / 99kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 5.7g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/1833/
- 厳選まぐろ赤身食べ比べ: 140円 / 81kcal
  - 公式: https://www.akindo-sushiro.co.jp/menu/menu_detail/
  - タンパク質参考値: 8.0g
  - kalori: https://kalori.jp/ja/shops/sushiro/products/907536/

## 補足

- スシローは店舗・地域で価格差があるページが混在していた。
- 今回は 2026-03-31 時点で WebSearch から確認できた公式メニュー表示を優先し、`data/menu-dataset.json` には単一価格を入れた。
- `びん長まぐろ` は公式検索結果で 190円/210円 の両方が見つかったため、今回の更新対象から外した。
