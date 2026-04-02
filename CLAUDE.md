# budget-menu-picker

> **作業開始前に必ず読む**: `/Users/ikedamasaki/dev/my/ikemasa-secretary/docs/harness/projects/budget-menu-picker.md` で現状・次のアクション・Verifyコマンドを確認すること。

予算と人数を入力すると献立候補を返すツール。

## Verify

```bash
npm test
```

## 作業後の振り返りルール

作業が完了したとき、または詰まって方針変更したときは、以下を確認する:
- 想定外の失敗・やり直しがあれば → harness の Failure Log に記録候補を残す
- 設計判断をしたなら → harness の Decision Log に記録候補を残す
- CLAUDE.md / harness / CI を変えるべきと気づいたなら → harness の Rule Update Candidates に追記する

記録は完璧でなくてよい。一行でよい。「次の自分への手紙」として残す。
