#!/bin/bash
# =============================================================================
# STG-001: Master Data Export from Prod → Import to weir-dev (STG)
# =============================================================================
# Purpose:
#   - Exports data from 44 master tables (+ review_alerts boundary→master) in prod
#   - Loads that data into the weir-dev (STG) Supabase project
#
# Prerequisites (run these FIRST, in order):
#   1. Tasei has created the `weir-dev` Supabase project (see Tasei-1 in report)
#   2. Schema is already applied to weir-dev. Preferred method:
#        supabase link --project-ref <weir-dev-ref> -p <db-password>
#        supabase db push
#      This applies all /supabase/migrations/*.sql to weir-dev in one shot.
#      (Alternative fallback: bash stg_003_schema_only_tables.sh, which dumps
#       the prod schema directly. Only needed if `supabase db push` is blocked.)
#   3. Environment variables exported to this shell:
#        export PROD_DB_URL="postgresql://postgres.iikwusprydaogzeslgdz:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
#        export STG_DB_URL="postgresql://postgres.<weir-dev-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
#
# Execution:
#   bash supabase/migrations-stg/stg_001_master_data_export.sh
#
# After this script:
#   Run stg_002_stripe_id_sanitization.sql to null out live Stripe IDs.
#
# Note on "本番→STG コピー" classification:
#   Source: CC_ENV-A_report_20260419.md タスク1 分類表
#   44 マスタ + 1 境界判断(review_alerts, メモで「マスタ扱いで OK」) = 45 テーブル
#   境界判断のうち accounts / device_tokens / monitoring_alerts / sns_connections /
#   staff_accounts の 5 件は「空で開始」なのでここでは対象外。
#   廃止予定 corps は weir-dev に存在しない前提(migrations 適用時に除外済の想定)。
# =============================================================================

set -euo pipefail

# ---- Preflight checks ----------------------------------------------------

if [ -z "${PROD_DB_URL:-}" ] || [ -z "${STG_DB_URL:-}" ]; then
  echo "ERROR: PROD_DB_URL and STG_DB_URL must be exported before running." >&2
  echo "See script header for the exact format." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found on PATH. Install PostgreSQL client tools." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found on PATH." >&2
  exit 1
fi

# Guard: prevent accidental execution against prod-shaped STG_DB_URL.
if [ "$STG_DB_URL" = "$PROD_DB_URL" ]; then
  echo "ERROR: STG_DB_URL and PROD_DB_URL are identical. Refusing to run." >&2
  exit 1
fi

# Guard: STG must NOT point to the known prod project ref.
if echo "$STG_DB_URL" | grep -q "iikwusprydaogzeslgdz"; then
  echo "ERROR: STG_DB_URL appears to point to the prod project (iikwusprydaogzeslgdz)." >&2
  echo "Refusing to overwrite prod with master data import." >&2
  exit 1
fi

# ---- Master tables to copy (44 master + 1 boundary→master) --------------

TABLES_MASTER=(
  # Base
  "access_list"

  # Brand domain
  "brand_campaigns"
  "brand_coupons"
  "brand_hero_slides"
  "brand_pages"
  "brand_permissions"
  "brand_templates"
  "brands"

  # Platform / Campaigns
  "campaigns"
  "categories"

  # Competitor intelligence
  "competitor_collection_config"
  "competitor_mappings"
  "competitor_stores"

  # Coupons / CRM
  "coupons"
  "crm_dispatches"

  # FAQ
  "faq_embeddings"
  "faqs"

  # Fee / Incentives
  "fee_schedules"
  "first_time_incentives"

  # External data cache
  "google_places"

  # Media
  "media"

  # Menu structure
  "menu_pattern_items"
  "menu_patterns"

  # Merchant domain
  "merchant_brand_relations"
  "merchants"

  # Options
  "option_groups"
  "option_items"

  # Platform global
  "platform_settings"

  # Points / Ranks / Products
  "point_settings"
  "product_option_groups"
  "product_sizes"
  "products"
  "rank_settings"

  # Review
  "review_alerts"            # 境界判断→マスタ扱い (CC_ENV-A memo)
  "review_point_settings"

  # Services / Templates
  "service_subscriptions"
  "spot_closures"
  "staff_venue_assignments"
  "templates"
  "usage_limits"

  # Venue domain
  "venue_channels"
  "venue_hours"
  "venue_policies"
  "venue_tables"
  "venues"
)

# Compose --table=public.<name> for each entry.
TABLE_ARGS=()
for t in "${TABLES_MASTER[@]}"; do
  TABLE_ARGS+=("--table=public.${t}")
done

DUMP_PATH="/tmp/stg_master_data_$(date +%Y%m%d_%H%M%S).sql"

# ---- Phase 1: dump master data from prod --------------------------------

echo "[stg_001] Dumping ${#TABLES_MASTER[@]} master tables from prod → ${DUMP_PATH}"
pg_dump \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  "${TABLE_ARGS[@]}" \
  "$PROD_DB_URL" > "$DUMP_PATH"

DUMP_SIZE=$(wc -l < "$DUMP_PATH" | tr -d ' ')
echo "[stg_001] Dump complete: ${DUMP_SIZE} lines"

# ---- Phase 2: load master data into STG ---------------------------------

echo "[stg_001] Loading master data into STG..."
psql -v ON_ERROR_STOP=1 --single-transaction "$STG_DB_URL" < "$DUMP_PATH"

# ---- Phase 3: sequence fixup (SETVAL) -----------------------------------
# Supabase tables default to UUID PK so sequences are rare, but any SERIAL
# columns need their sequence synchronized to MAX(id) or subsequent INSERTs
# will fail with duplicate-key errors.

echo "[stg_001] Running sequence fixup on STG..."
psql -v ON_ERROR_STOP=1 "$STG_DB_URL" <<'EOF'
DO $$
DECLARE
  seq_rec RECORD;
  max_val BIGINT;
  stmt TEXT;
BEGIN
  FOR seq_rec IN
    SELECT
      n.nspname  AS schema_name,
      c.relname  AS table_name,
      a.attname  AS col_name,
      pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS seq_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) IS NOT NULL
  LOOP
    stmt := format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', seq_rec.col_name, seq_rec.schema_name, seq_rec.table_name);
    EXECUTE stmt INTO max_val;
    IF max_val > 0 THEN
      EXECUTE format('SELECT setval(%L, %s, true)', seq_rec.seq_name, max_val);
      RAISE NOTICE 'setval(%, %) done', seq_rec.seq_name, max_val;
    END IF;
  END LOOP;
END $$;
EOF

echo "[stg_001] Master data export + load complete."
echo "[stg_001] Next: psql \"\$STG_DB_URL\" < stg_002_stripe_id_sanitization.sql"
