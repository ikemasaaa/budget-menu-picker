# budget-menu-picker

予算・カロリー・タンパク質条件から、チェーン店メニューの組み合わせ候補を探す非公式MVPです。

## 開発コマンド

```bash
npm run build
npm test
npm run start
```

## 構成

- `docs/architecture.md`: 技術選定理由とMVP設計
- `data/menu-dataset.json`: 手動整備した参考データ
- `src/`: フロントエンドと探索ロジック
- `tests/`: 探索ロジックのユニットテスト
- `scripts/build.ts`: Node標準機能だけで静的配信用にビルド

## 注意

- 価格・栄養値は公開情報を元に手動で整形した参考値です。
- 非公式アプリです。実店舗・公式サイトの最新情報を優先してください。
