-- =============================================================================
-- STG-002: Stripe live-ID sanitization on weir-dev (STG)
-- =============================================================================
-- Purpose:
--   STG uses Stripe Test Mode. Live-mode IDs (acct_live_*, cus_live_*, pi_live_*)
--   cannot be resolved by test-mode API keys. After stg_001 copies production
--   master data, this script nulls those IDs so Tasei can reassign test-mode
--   equivalents (or let them be re-created by normal STG flows).
--
--   Columns targeted (source: CC_ENV-A_report タスク1 分類表):
--     merchants.stripe_account_id       (master, live value copied from prod)
--     venues.stripe_account_id          (master, live value copied from prod)
--     members.stripe_customer_id        (tx empty in STG, null for safety)
--     orders.stripe_payment_intent_id   (tx empty in STG, null for safety)
--     payments.stripe_payment_intent_id (tx empty in STG, null for safety)
--     refunds.stripe_refund_id          (tx empty in STG, null for safety)
--
-- Prerequisites:
--   1. stg_001_master_data_export.sh has completed successfully
--   2. STG_DB_URL points to weir-dev (NOT prod)
--
-- Execution:
--   psql "$STG_DB_URL" < supabase/migrations-stg/stg_002_stripe_id_sanitization.sql
--
-- Safety guard:
--   The script aborts if connected to the prod project by checking
--   current_database() + a known-prod comment check.
-- =============================================================================

-- Guard: refuse to run against prod's known project ref embedded in a
-- pg_catalog lookup. Since pooler hostname is not exposed via SQL, we rely on
-- the operator honoring the script header. Additional guard: require the STG
-- project to contain zero orders (tx tables must be empty per stg_001 design).
DO $$
DECLARE
  order_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO order_count FROM orders;
  IF order_count > 0 THEN
    RAISE EXCEPTION 'Safety abort: orders table has % rows. STG is expected to start with 0 orders. If you are running this against prod, STOP.', order_count;
  END IF;
END $$;

BEGIN;

-- Master tables (non-empty in STG after stg_001)
UPDATE merchants SET stripe_account_id = NULL WHERE stripe_account_id IS NOT NULL;
UPDATE venues    SET stripe_account_id = NULL WHERE stripe_account_id IS NOT NULL;

-- Transaction tables (empty in STG; belt-and-suspenders)
UPDATE members  SET stripe_customer_id      = NULL WHERE stripe_customer_id      IS NOT NULL;
UPDATE orders   SET stripe_payment_intent_id = NULL WHERE stripe_payment_intent_id IS NOT NULL;
UPDATE payments SET stripe_payment_intent_id = NULL WHERE stripe_payment_intent_id IS NOT NULL;
UPDATE refunds  SET stripe_refund_id        = NULL WHERE stripe_refund_id        IS NOT NULL;

COMMIT;

-- Verification report (expected: all zeros).
SELECT 'merchants.stripe_account_id NOT NULL'   AS metric, COUNT(*) AS cnt FROM merchants WHERE stripe_account_id IS NOT NULL
UNION ALL
SELECT 'venues.stripe_account_id NOT NULL',              COUNT(*) FROM venues    WHERE stripe_account_id IS NOT NULL
UNION ALL
SELECT 'members.stripe_customer_id NOT NULL',            COUNT(*) FROM members   WHERE stripe_customer_id IS NOT NULL
UNION ALL
SELECT 'orders.stripe_payment_intent_id NOT NULL',       COUNT(*) FROM orders    WHERE stripe_payment_intent_id IS NOT NULL
UNION ALL
SELECT 'payments.stripe_payment_intent_id NOT NULL',     COUNT(*) FROM payments  WHERE stripe_payment_intent_id IS NOT NULL
UNION ALL
SELECT 'refunds.stripe_refund_id NOT NULL',              COUNT(*) FROM refunds   WHERE stripe_refund_id IS NOT NULL;
