# migrations-stg/ — weir-dev (STG) Bootstrap Scripts

## 目的

本番 Supabase (`iikwusprydaogzeslgdz`) → weir-dev (STG) へのデータ・スキーマ移行用スクリプト群。

- ENV 分離プロジェクト Phase B（P0-9）で 1 回だけ実行する想定
- 通常の migration（`supabase/migrations/*.sql`）とは別扱い (フォルダを分けることで誤って本番に適用されないようにする)

## 分類の根拠

分類表は `cc-requests/CC_ENV-A_report_20260419.md` タスク1 出力フォーマット1 を参照。

| 種別 | 件数 | 本番→STG 扱い | 対象スクリプト |
|---|---|---|---|
| マスタ | 44 | データ含めコピー | `stg_001` + review_alerts を追加 |
| トランザクション | 46 | スキーマのみ、空で開始 | `stg_003` |
| 境界判断→マスタ扱い (review_alerts) | 1 | マスタ扱い | `stg_001` |
| 境界判断→空で開始 | 5 | スキーマのみ | `stg_003` |
| VIEW | 5 | SQL 再作成 | `stg_003` (pg_dump が DDL 出す) |
| 廃止予定 (corps) | 1 | STG に作成しない | 対象外 |
| **合計** | **102** | | |

## 推奨実行フロー

```bash
# 0. 環境変数を export（Tasei が weir-dev 作成後に取得する値を使用）
export PROD_DB_URL="postgresql://postgres.iikwusprydaogzeslgdz:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
export STG_DB_URL="postgresql://postgres.<weir-dev-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"

# 1. スキーマ作成 — Supabase CLI で全 migration を適用（推奨）
supabase link --project-ref <weir-dev-ref> -p <db-password>
supabase db push

# 2. マスタデータ投入
bash supabase/migrations-stg/stg_001_master_data_export.sh

# 3. Stripe ID サニタイズ（live → null 化）
psql "$STG_DB_URL" < supabase/migrations-stg/stg_002_stripe_id_sanitization.sql

# 4. 検証（次セクション）
```

## フォールバック: supabase db push が使えない場合

`supabase db push` がブロックされている場合（migration 履歴の不整合、CLI 認証失敗など）のみ `stg_003` を使う:

```bash
# 1. スキーマのみ pg_dump で作成（tx / view / boundary 56 オブジェクト）
bash supabase/migrations-stg/stg_003_schema_only_tables.sh

# 2. マスタテーブルのスキーマ + データを同時投入するため、
#    stg_001 の pg_dump オプションから --data-only を外した変種が必要。
#    通常ケースでは不要なので script 未提供。必要時は stg_001 を修正して実行。

# 3. Stripe ID サニタイズ
psql "$STG_DB_URL" < supabase/migrations-stg/stg_002_stripe_id_sanitization.sql
```

## 検証クエリ

```sql
-- テーブル数（期待値: 101 = 102 - corps）
SELECT COUNT(*) AS table_count FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- VIEW 数（期待値: 5）
SELECT COUNT(*) AS view_count FROM information_schema.views
WHERE table_schema = 'public';

-- マスタ件数チェック（本番と一致するはず）
SELECT 'brands' AS tbl, COUNT(*) FROM brands
UNION ALL SELECT 'merchants', COUNT(*) FROM merchants
UNION ALL SELECT 'venues', COUNT(*) FROM venues
UNION ALL SELECT 'products', COUNT(*) FROM products;

-- トランザクション件数チェック（全て 0 が期待値）
SELECT 'orders' AS tbl, COUNT(*) FROM orders
UNION ALL SELECT 'members', COUNT(*) FROM members
UNION ALL SELECT 'reservations', COUNT(*) FROM reservations
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

-- Stripe live ID 残存チェック（全て 0 が期待値）
SELECT 'merchants.stripe_account_id' AS col, COUNT(*) FROM merchants WHERE stripe_account_id IS NOT NULL
UNION ALL SELECT 'venues.stripe_account_id', COUNT(*) FROM venues WHERE stripe_account_id IS NOT NULL;
```

## 境界判断テーブル個別ノート (CC_ENV-A 引き継ぎ)

| テーブル | CC_ENV-A の理由 | CC_ENV-B 処理 |
|---|---|---|
| `accounts` | 旧認証、D-136 4分離設計と未統合 | stg_003 でスキーマのみ作成、データ空 |
| `device_tokens` | FCM device token、PII 扱い | 同上 |
| `monitoring_alerts` | 履歴テーブル (マスタでない) | 同上 |
| `review_alerts` | 閾値設定 (マスタ寄り) | `stg_001` でデータ含めコピー |
| `sns_connections` | SNS OAuth トークン | stg_003 でスキーマのみ、データ空 |
| `staff_accounts` | 運用者個人情報 | 同上 (STG では test メールで再作成) |

## 廃止テーブル (corps) について

- `corps` は D-92 で merchants へ統合済、本番に 6 行残骸
- weir-dev には最初から作成しない (migration 適用時に除外されている前提)
- 本番の `DROP TABLE corps` 実施は CC ENV-B のスコープ外 (別途 Tasei 承認後に CC ENV-C で対応)

## PII に関する注意

本番→STG コピーを行うマスタには以下 PII 相当カラムを含む:

- `brands.contact_email`, `brands.escalation_email`, `brands.contact_name`
- `merchants.bank_account_number`, `merchants.contact_email`, `merchants.rep_email`, `merchants.bank_name`
- `venues.address`, `venues.email`, `venues.phone`
- `competitor_stores.address`, `competitor_stores.phone`
- `google_places.address`

**判断保留**:
連絡先メール (contact_email など) を本番そのままコピーするか、テスト用ダミーに置換するかは、Tasei の運用判断による。置換が必要な場合は `stg_002` に UPDATE 文を追加する (例: `UPDATE brands SET contact_email = 'stg-' || id || '@example.com'`)。

Stripe Connect ID は `stg_002_stripe_id_sanitization.sql` で強制 null 化するため、
sk_test モードでの API 呼び出しで 404 を返す問題は解消済。

## 実行ログの残し方

問題発生時の切り分け用に、各スクリプトの出力をログに残しておくことを推奨:

```bash
bash stg_001_master_data_export.sh 2>&1 | tee /tmp/stg_001_$(date +%Y%m%d_%H%M%S).log
psql "$STG_DB_URL" < stg_002_stripe_id_sanitization.sql 2>&1 | tee /tmp/stg_002_$(date +%Y%m%d_%H%M%S).log
```
