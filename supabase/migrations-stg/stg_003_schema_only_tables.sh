#!/bin/bash
# =============================================================================
# STG-003: Schema-only fallback for tx / view / boundary-empty tables
# =============================================================================
# Purpose:
#   Fallback path when `supabase db push` cannot apply migrations (e.g. broken
#   migration ordering, Supabase CLI auth issues, or STG provisioning outside
#   normal workflow).
#
#   Dumps schema only from prod for:
#     - 46 transaction tables  (empty in STG)
#     - 5  VIEWs               (brands_public, venues_public, guest_order_summaries,
#                                orders_dashboard_view, orders_public_view)
#     - 5  boundary→empty tables (accounts, device_tokens, monitoring_alerts,
#                                  sns_connections, staff_accounts)
#
#   = 56 schema-only objects. Combined with stg_001 (45 master tables with data),
#   this covers 101 of 102 tables. (102 - 1 corps deprecated = 101.)
#
# **When to use**:
#   - PRIMARY: NOT needed. Prefer `supabase db push` against weir-dev, which
#     applies the canonical migration set and creates ALL schema including
#     masters. This keeps STG in lockstep with the migration history.
#   - FALLBACK: Run this only if `supabase db push` is blocked and you need to
#     bootstrap STG schema from prod.
#
# Prerequisites:
#   - PROD_DB_URL and STG_DB_URL exported (same format as stg_001)
#   - If running this, you should NOT have run `supabase db push` (to avoid
#     duplicate-object errors). Or run against a fresh weir-dev project.
#
# Execution:
#   bash supabase/migrations-stg/stg_003_schema_only_tables.sh
#
# After this script:
#   Run stg_001 (master data) and stg_002 (Stripe sanitize).
# =============================================================================

set -euo pipefail

# ---- Preflight -----------------------------------------------------------

if [ -z "${PROD_DB_URL:-}" ] || [ -z "${STG_DB_URL:-}" ]; then
  echo "ERROR: PROD_DB_URL and STG_DB_URL must be exported before running." >&2
  exit 1
fi

if [ "$STG_DB_URL" = "$PROD_DB_URL" ]; then
  echo "ERROR: STG_DB_URL and PROD_DB_URL are identical. Refusing to run." >&2
  exit 1
fi

if echo "$STG_DB_URL" | grep -q "iikwusprydaogzeslgdz"; then
  echo "ERROR: STG_DB_URL appears to point to prod. Refusing." >&2
  exit 1
fi

# ---- Tables to dump schema-only -----------------------------------------

# 46 transaction tables (CC_ENV-A 分類: 空で開始)
TABLES_TX=(
  "ai_interactions"
  "ai_monthly_usage"
  "ai_usage_logs"
  "alert_history"
  "audit_logs"
  "brand_news"
  "change_logs"
  "chat_messages"
  "chat_sessions"
  "collection_progress"
  "competitor_metrics_weekly"
  "competitor_reviews"
  "crm_send_logs"
  "customer_chat_messages"
  "customer_chats"
  "db_metrics"
  "delivery_tracking"
  "edge_function_logs"
  "google_reviews"
  "guest_registration_prompt"
  "guests"
  "invoice_adjustments"
  "invoices"
  "member_addresses"
  "member_coupons"
  "members"
  "order_item_options"
  "order_items"
  "orders"
  "payment_attempts"
  "payments"
  "plan_change_requests"
  "point_logs"
  "point_transactions"
  "refunds"
  "reservations"
  "review_tokens"
  "reviews"
  "sns_posts"
  "sns_scheduled_posts"
  "status_change_log"
  "support_messages"
  "support_tickets"
  "usage_logs"
  "user_bans"
  "venue_merchant_history"
)

# 5 boundary→empty tables (CC_ENV-A メモ: STG では空で開始)
TABLES_BOUNDARY_EMPTY=(
  "accounts"
  "device_tokens"
  "monitoring_alerts"
  "sns_connections"
  "staff_accounts"
)

# 5 VIEWs (pg_dump --schema-only emits the CREATE VIEW DDL automatically
# as long as the dependencies (tables) are also included.)
VIEWS=(
  "brands_public"
  "guest_order_summaries"
  "orders_dashboard_view"
  "orders_public_view"
  "venues_public"
)

TABLE_ARGS=()
for t in "${TABLES_TX[@]}" "${TABLES_BOUNDARY_EMPTY[@]}" "${VIEWS[@]}"; do
  TABLE_ARGS+=("--table=public.${t}")
done

DUMP_PATH="/tmp/stg_tx_schema_$(date +%Y%m%d_%H%M%S).sql"

# ---- Phase 1: dump schema-only from prod --------------------------------

echo "[stg_003] Dumping schema-only for $((${#TABLES_TX[@]} + ${#TABLES_BOUNDARY_EMPTY[@]} + ${#VIEWS[@]})) objects → ${DUMP_PATH}"
pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  "${TABLE_ARGS[@]}" \
  "$PROD_DB_URL" > "$DUMP_PATH"

echo "[stg_003] Schema dump complete: $(wc -l < "$DUMP_PATH" | tr -d ' ') lines"

# ---- Phase 2: load schema into STG --------------------------------------

echo "[stg_003] Loading schema into STG..."
psql -v ON_ERROR_STOP=1 --single-transaction "$STG_DB_URL" < "$DUMP_PATH"

echo "[stg_003] Schema-only load complete."
echo "[stg_003] Next: bash stg_001_master_data_export.sh"
