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


## Codex連携ルール

### 役割分担
- **Claude Code**: 要件整理・設計・計画・進捗管理・報告
- **Codex**: コーディング・レビュー・実装・技術調査
- Claude Codeがコードを書くのは禁止。codexに委任する

### スキル
- `/pair`: 計画→Codexレビュー→実装の一気通貫（フロー途中で止めない）
- `/codex-plan`: 計画作成のみ
- `/codex-code`: 実装のみ
- `/codex-review`: コードレビューのみ
- `/codex-ask`: セカンドオピニオン
- `/codex-loop`: 指摘ゼロまで磨き上げ
- `/codex-research`: 非同期調査（Discord webhook配信）

### codex実行ルール
- 必ずBashツール経由で実行（MCP経由は使わない）
- 出力は `-o` フラグでファイルに保存して読む
- プロンプトは一時ファイル経由で渡す（`$()` 警告回避）
- Phase 2（レビュー）は `--sandbox read-only`、Phase 4（実装）は `--sandbox danger-full-access`

