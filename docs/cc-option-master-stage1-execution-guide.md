# CC-Option-Master-Stage1 本番実行ガイド

> **対象**: Taisei（本番 Supabase Dashboard での手動 SQL 実行）
> **関連**: D-242 (β 採用確定) / migration `supabase/migrations/20260423700000_option_master_stage1.sql`
> **所要時間**: 約 5-10 分

---

## 実行前チェック（3 項目）

### ① 本番データ件数確認
Supabase Dashboard → SQL Editor を開き、以下を実行して既存の衝突がないか確認:

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'option_groups') AS option_groups_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'options') AS options_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_option_groups') AS pog_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'option_sale_status') AS oss_exists;
```

**期待結果**: 全て `0` （未作成）。1 以上なら**絶対に migration を実行しない**（既存テーブルと衝突するため）。

### ② update_updated_at_column 関数存在確認
```sql
SELECT proname, pronamespace::regnamespace
FROM pg_proc
WHERE proname = 'update_updated_at_column';
```

**期待結果**: 1 行以上（`update_updated_at_column | public`）。0 行なら migration が失敗するため、先に `20260408200000_template_catalog.sql` の実行状況を確認。

### ③ FK 参照先テーブル存在確認
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('brands', 'products', 'venues', 'staff_accounts')
ORDER BY table_name;
```

**期待結果**: 4 行（全てが存在）。

---

## Migration 本体実行

### Step 1: Dashboard SQL Editor を開く
https://supabase.com/dashboard/project/iikwusprydaogzeslgdz/sql/new

### Step 2: Migration ファイル全文を貼り付け
ローカルの `supabase/migrations/20260423700000_option_master_stage1.sql` の内容を**全て**コピーして SQL Editor に貼り付け。

ファイル冒頭の `BEGIN;` から末尾の `COMMIT;` までを含めること（ロールバック用の `-- BEGIN;` コメント部分は貼り付け不要、実行不要）。

### Step 3: Run ボタンをクリック
実行に成功すると以下のようなメッセージが表示される:
```
Success. No rows returned
```

失敗時のエラーメッセージを記録し、下記「トラブルシューティング」参照。

---

## 実行後検証（5 項目）

### ① テーブル 4 つ作成確認
```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('option_groups', 'options', 'product_option_groups', 'option_sale_status')
ORDER BY table_name;
```

**期待結果**: 4 行
```
option_groups          | BASE TABLE
option_sale_status     | BASE TABLE
options                | BASE TABLE
product_option_groups  | BASE TABLE
```

### ② カラム定義確認
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'option_groups'
ORDER BY ordinal_position;
```

**期待結果**（抜粋）:
- `group_id uuid` NOT NULL, default: `gen_random_uuid()`
- `display_id text` NOT NULL, default: `'GRP-' || substr(md5((random())::text), 1, 7)`
- `brand_id uuid` NOT NULL
- `selection_type text` NOT NULL
- `is_required boolean` NOT NULL, default: `false`
- `is_available boolean` NOT NULL, default: `true`

### ③ RLS ポリシー 24 個作成確認
```sql
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('option_groups', 'options', 'product_option_groups', 'option_sale_status')
GROUP BY tablename
ORDER BY tablename;
```

**期待結果**: 各テーブル 6 ポリシー × 4 = 合計 24
```
option_groups          | 6
option_sale_status     | 6
options                | 6
product_option_groups  | 6
```

### ④ インデックス 6 個作成確認
```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('option_groups', 'options', 'product_option_groups', 'option_sale_status')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

**期待結果**: 6 行
```
idx_option_groups_brand          | option_groups
idx_option_sale_status_venue     | option_sale_status
idx_option_sale_status_venue_status | option_sale_status
idx_options_group                | options
idx_pog_group                    | product_option_groups
idx_pog_product                  | product_option_groups
```

### ⑤ updated_at トリガー 3 個作成確認
```sql
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN ('set_option_groups_updated_at', 'set_options_updated_at', 'set_option_sale_status_updated_at')
ORDER BY tgname;
```

**期待結果**: 3 行（option_groups / options / option_sale_status のみ。product_option_groups は updated_at カラムを持たないためトリガー無し）。

---

## トラブルシューティング

### エラー: `relation "brands" does not exist`
→ `brands` テーブルが未作成。`20260402100000_admin_display_ids.sql` 等の先行 migration を確認。

### エラー: `function update_updated_at_column() does not exist`
→ 事前チェック ② で確認。`20260408200000_template_catalog.sql` を先に実行。

### エラー: `policy "xxx" for table "xxx" already exists`
→ 既に部分的に実行された状態。以下のロールバック SQL を実行してから再実行:
```sql
-- 以下を貼り付けて実行
BEGIN;
  DROP TRIGGER IF EXISTS set_option_sale_status_updated_at ON option_sale_status;
  DROP TRIGGER IF EXISTS set_options_updated_at ON options;
  DROP TRIGGER IF EXISTS set_option_groups_updated_at ON option_groups;
  DROP TABLE IF EXISTS option_sale_status;
  DROP TABLE IF EXISTS product_option_groups;
  DROP TABLE IF EXISTS options;
  DROP TABLE IF EXISTS option_groups;
COMMIT;
```
その後、migration 本体を再実行。

### エラー: CHECK 制約違反
→ migration ファイル内の CHECK 値を確認。spec 通りの値になっているか `20260423700000_option_master_stage1.sql` を再確認。

---

## 完全ロールバック手順（本番反映後、問題発覚時）

Dashboard SQL Editor で以下を実行すると 4 テーブル全て削除されます。**CASCADE により紐付く FK データも消えるため、データ投入済みなら注意**。

```sql
BEGIN;
  DROP TRIGGER IF EXISTS set_option_sale_status_updated_at ON option_sale_status;
  DROP TRIGGER IF EXISTS set_options_updated_at ON options;
  DROP TRIGGER IF EXISTS set_option_groups_updated_at ON option_groups;
  DROP TABLE IF EXISTS option_sale_status;
  DROP TABLE IF EXISTS product_option_groups;
  DROP TABLE IF EXISTS options;
  DROP TABLE IF EXISTS option_groups;
COMMIT;
```

---

## 完了報告

以下を Taisei → CC に連絡:

- [ ] 実行前チェック ①②③ 全て期待通り
- [ ] Migration 実行成功
- [ ] 実行後検証 ①②③④⑤ 全て期待通り
- [ ] （もし失敗した場合）エラーメッセージ + 実行ステップのスクリーンショット

問題なければ、次のステップ `docs/cc-option-master-stage1-smoke-test.md` を実施。
