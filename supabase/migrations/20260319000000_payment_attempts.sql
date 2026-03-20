-- ============================================================
-- payment_attempts: 決済失敗ログテーブル
-- 決済が失敗した場合にフロントから記録する
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  email TEXT,
  phone TEXT,
  order_type TEXT,
  total_amount INTEGER,
  payment_intent_id TEXT,
  failure_reason TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

-- service_role のみ全操作可能
CREATE POLICY "payment_attempts_service_role_all"
  ON payment_attempts FOR ALL
  USING (auth.role() = 'service_role'::text);

-- インデックス
CREATE INDEX idx_payment_attempts_email ON payment_attempts(email);
CREATE INDEX idx_payment_attempts_store ON payment_attempts(store_id, created_at DESC);
CREATE INDEX idx_payment_attempts_created ON payment_attempts(created_at DESC);
