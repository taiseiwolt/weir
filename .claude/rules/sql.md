# SQL / Database コーディング規約

## 命名・構造
- テーブル名: 複数形スネークケース（例: `order_items`）
- 全テーブルに `created_at`, `updated_at` を含める
- 外部キー: 適切な ON DELETE 設定（CASCADE or SET NULL）

## RLS (Row Level Security)
- 全テーブルで有効化必須。有効化と同時にポリシーを設定すること
- 管理専用テーブルのRLSボイラープレート:
  ```sql
  ALTER TABLE tbl ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "service_role_only" ON tbl TO service_role USING (true) WITH CHECK (true);
  ```

## pg_cron
- pg_cronジョブの http_post header で service_role_key を参照する場合は current_setting() ではなく直接値を記載する（pg_cronのコンテキストでは current_setting() が動作しない）

## マイグレーション
- `supabase/migrations/` に日付プレフィックス付きで保存（YYYYMMDD形式）
- ファイル名の日付は作成当日の日付を使用する（翌日日付は使用しない）

## セキュリティ
- 本番データに影響するSQL: 実行前に SELECT で影響範囲を確認する
- パラメータ化クエリを必ず使用する（SQL Injection対策）
