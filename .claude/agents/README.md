# Agent Teams Configuration

CLAUDE.md から切り出したエージェントチーム構成。CCは必要時のみこのファイルを参照する。

## QA Team (aiden-qa-team)
- リーダー: QA Lead（タスク登録・結果集約・最終レポート）
- チームメイト: auto-tester / chrome-visual / chrome-destructive / db-verifier / critical-observer
- 出力先: ~/Desktop/aiden-demo/qa-results/{agent-name}/
- 通信ルール:
  - バグ発見 → QA Lead に即報告（DM）
  - DB関連バグ → db-verifier にも同時にDM
  - ブロードキャスト = クリティカルバグ（決済・個人情報系）のみ
  - chrome-visual と chrome-destructive は同一ページ同時テスト禁止（QA Leadがタスクリストで制御）
- テスト用データには `_test_` プレフィックスを付与（本番データ汚染防止）

## チームB（プロジェクト実行チーム）
- 機能追加・修正プロジェクトはチームBのフロー（①〜⑧）に従って遂行する
- ⑦ Devil's Advocate と ⑧ Project Supervisor は常時稼働
- Taiseiの承認ポイントは3箇所: ①要件確定後 / ④CC依頼文完成後 / ⑦最終判定後
- チームAとの連携: ①②④完了時に必ずチームA関連エージェントのレビューを実施
- 詳細は `.claude/agents/agents-project-execution.md` を参照

## チームC（セキュリティテストチーム）
- 概要: Weirの全サービス（HP/管理マスタ/顧客管理/受注アプリ）を横断的にセキュリティレビューする7エージェント体制
- `/team-c` コマンドで一発実行可能
- エージェント構成:
  | # | 名称 | 対象 |
  |---|---|---|
  | 00 | セキュリティリード | 全体統括・最終レポート |
  | 01 | 公開面テスター | HP/MO/管理画面のXSS・情報漏洩 |
  | 02 | 認証・RLSテスター | 全テーブルRLS/Realtime/Storage |
  | 03 | 決済テスター | Stripe Connect/Billing |
  | 04 | API・インフラテスター | Vercel Functions + Edge Functions |
  | 05 | 監視・保守テスター | 運用・バックアップ・ヘッダー |
  | 06 | モバイルアプリテスター | Flutter iOS受注アプリ |
- 実行方法:
  - 方法A（推奨）: CCで `/team-c` を実行 → 1セッションで順次レビュー
  - 方法B（並列）: iTerm2で6タブ開き、Agent 01〜06を並列実行 → 完了後Agent 00で集約
- 注意事項:
  - チームCはコードを変更しない（読み取り・検証のみ）
  - 発見した脆弱性の修正は、レポート確認後に別CCタスクで実施
  - Supabase本番データの変更禁止（SELECT文のみ）
  - Stripeテスト環境のみ使用
- 実行頻度:
  - 月次定期: 毎月第1月曜日
  - リリース前: 新機能デプロイ前
  - 臨時: テーブル追加・RLS変更時
- エージェント定義: `.claude/agents/security/` 配下（00〜06）
- レポートテンプレート: `security-reports/TEMPLATE.md`

## 共通ルール
- ブロードキャストは最小限（トークンコスト削減）
- 各チームメイトは完了時にサマリをQA Leadに報告
- テスト用データには `_test_` プレフィックスを付与
