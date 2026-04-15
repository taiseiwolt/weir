# Weir QA Team 起動プロンプト

Weir の QA チームを起動してください。

## テスト対象
本番E2Eテスト計画（~/Desktop/aiden-demo/test-results/production-e2e-day1-manual-checklist.md）の全47項目。

## チームメイト5名

### 1. auto-tester
- 担当: API・Edge Function・バックエンドのテスト
- 対象テスト: C-01〜C-11（バックエンド整合性11項目）
- 手法: curl / Supabase REST API / Edge Function呼び出し
- 結果出力先: ~/Desktop/aiden-demo/qa-results/auto/

### 2. chrome-visual
- 担当: UIの正常表示・導線確認
- 対象テスト: A-01〜A-14のうち画面表示確認、B-01〜B-12のうち反映確認、D-05〜D-08（問い合わせフッター）
- 手法: Chrome経由でページアクセス、表示確認
- 結果出力先: ~/Desktop/aiden-demo/qa-results/visual/

### 3. chrome-destructive
- 担当: 異常系テスト・エッジケース
- 対象テスト: A-01〜A-14のうち注文実行（Stripe Test Card使用）、B-11〜B-12（返金操作）、D-01〜D-04（認証フロー）
- 手法: Chrome経由で実操作、Stripe Test Card 4242 4242 4242 4242 使用
- 結果出力先: ~/Desktop/aiden-demo/qa-results/destructive/

### 4. db-verifier
- 担当: DB整合性・セキュリティ・金額照合
- 対象テスト: C-01〜C-04（3-way金額照合）、C-05〜C-08（セキュリティ）、C-09〜C-11（cron・営業時間）、B-09（ゲストPII保護）
- 手法: Supabase REST API / SQL実行
- 結果出力先: ~/Desktop/aiden-demo/qa-results/db/

### 5. critical-observer
- 担当: 他4名のテスト結果を監視し、テスト漏れを指摘、追加テストを提案
- 対象: 全47項目の網羅性チェック + 設計書にない暗黙の前提の検証
- 結果出力先: ~/Desktop/aiden-demo/qa-results/observer-notes/

## 接続情報
- 本番URL: https://xorder.co.jp
- Supabase: https://iikwusprydaogzeslgdz.supabase.co
- Anon Key: sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC
- Stripe Test Card: 4242 4242 4242 4242（有効期限: 任意の未来日、CVC: 任意3桁）

## テスト用店舗
- 新宿店: store_hours 7件, products 12件（E2E Day1 事前準備で確認済み）

## 実行ルール
1. タスクリストに47テスト項目を登録し、各チームメイトに割り当ててください
2. chrome-visual と chrome-destructive は同じページを同時にテストしないでください
3. テスト用データには `_test_` プレフィックスを付与してください
4. クリティカルバグ（決済・個人情報系）発見時のみブロードキャスト
5. 各チームメイトはテスト完了後にサマリを私（QA Lead）に報告してください
6. 全テスト完了後、~/Desktop/aiden-demo/qa-results/final-report.md に最終レポートを生成してください

## 最終レポートのフォーマット

```
# 本番E2Eテスト QAチーム最終レポート — YYYY-MM-DD

## サマリ
- 総テスト数: 47
- PASS: __件
- FAIL: __件
- SKIP: __件

## カテゴリ別結果

| カテゴリ | 項目数 | PASS | FAIL | SKIP |
|---|---|---|---|---|
| A. 注文E2Eフロー | 14 | | | |
| B. データ連携 | 12 | | | |
| C. バックエンド整合性 | 11 | | | |
| D. 運用基盤 | 10 | | | |

## FAIL一覧

| # | テスト | 担当エージェント | 症状 | 推奨修正 |
|---|---|---|---|---|

## critical-observer の指摘事項
- テスト漏れ:
- 追加テスト提案:

## 各エージェント実行サマリ

### auto-tester

### chrome-visual

### chrome-destructive

### db-verifier

### critical-observer
```
