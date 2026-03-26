-- =============================================================
-- 来店予約機能 マイグレーション
-- =============================================================

-- -----------------------------------------------------------
-- 1. reservations テーブル
-- -----------------------------------------------------------
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  customer_id UUID REFERENCES members(id) ON DELETE SET NULL,
  display_id TEXT NOT NULL UNIQUE,

  -- 予約情報
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size > 0),
  seat_type TEXT,
  course_id UUID REFERENCES menu_items(id),

  -- ゲスト情報
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_email TEXT,
  special_requests TEXT,

  -- ステータス
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'confirmed',
    'cancelled',
    'cancel_requested',
    'no_show',
    'completed'
  )),

  -- キャンセル関連
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT CHECK (cancelled_by IN ('customer', 'store', 'system')),
  cancellation_reason TEXT,

  -- Stripe（キャンセル料用）
  stripe_payment_method_id TEXT,
  cancellation_fee_amount INTEGER DEFAULT 0,
  cancellation_fee_charged BOOLEAN DEFAULT FALSE,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_reservations_store_date ON reservations(store_id, reservation_date);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_display_id ON reservations(display_id);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_reservations_updated_at();

-- -----------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON reservations
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_insert" ON reservations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "authenticated_select_own" ON reservations
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- -----------------------------------------------------------
-- 3. stores テーブルに予約設定カラム追加
-- -----------------------------------------------------------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS reservation_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS reservation_confirmation_mode TEXT DEFAULT 'manual'
  CHECK (reservation_confirmation_mode IN ('auto', 'manual'));
ALTER TABLE stores ADD COLUMN IF NOT EXISTS reservation_require_card BOOLEAN DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS reservation_cancellation_fee INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS reservation_cancel_deadline_hours INTEGER DEFAULT 72;

-- -----------------------------------------------------------
-- 4. Realtime 有効化
-- -----------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
