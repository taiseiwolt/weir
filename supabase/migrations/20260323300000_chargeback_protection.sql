-- ============================================================
-- chargeback_protection: チャージバック対策用スキーマ変更
-- - orders.card_fingerprint カラム追加
-- - payment_status CHECK制約に 'disputed', 'captured', 'failed' を追加
-- - card_fingerprint + created_at インデックス追加
-- ============================================================

-- 1. orders テーブルに card_fingerprint カラムを追加
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;

-- 2. payment_status CHECK制約を更新（既存の制約を削除して再作成）
-- 既存の CHECK 制約名を特定して削除
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- 新しい CHECK 制約を作成（disputed, captured, failed を追加）
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'captured', 'failed', 'refunded', 'partially_refunded', 'disputed'));

-- 3. card_fingerprint + created_at のインデックス（頻度制限クエリ用）
CREATE INDEX IF NOT EXISTS idx_orders_card_fingerprint_created
  ON orders (card_fingerprint, created_at DESC)
  WHERE card_fingerprint IS NOT NULL;

-- 4. audit_logs テーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- service_role のみ全操作可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_service_role_all'
  ) THEN
    CREATE POLICY audit_logs_service_role_all
      ON audit_logs FOR ALL
      USING (auth.role() = 'service_role'::text);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action, created_at DESC);
