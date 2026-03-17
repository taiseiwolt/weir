-- ============================================================
-- AIden Step 4: 会員登録拡充 + 初回特典テーブル
-- 実行場所: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. members テーブルに favorite_store_ids カラム追加
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='favorite_store_ids') THEN
    ALTER TABLE members ADD COLUMN favorite_store_ids UUID[] DEFAULT '{}';
  END IF;
END
$$;

-- gender の CHECK制約を更新（'no_answer' を追加）
DO $$
BEGIN
  -- 既存の制約を削除
  ALTER TABLE members DROP CONSTRAINT IF EXISTS members_gender_check;
  -- 新しい制約を追加
  ALTER TABLE members ADD CONSTRAINT members_gender_check CHECK (gender IN ('male', 'female', 'other', 'no_answer'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- 2. first_time_incentives テーブル作成
CREATE TABLE IF NOT EXISTS first_time_incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('point', 'coupon', 'both')),
  point_amount INTEGER DEFAULT 0,
  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id)
);

-- RLS
ALTER TABLE first_time_incentives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "first_time_incentives_select_public" ON first_time_incentives;
CREATE POLICY "first_time_incentives_select_public" ON first_time_incentives
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "first_time_incentives_service_role_all" ON first_time_incentives;
CREATE POLICY "first_time_incentives_service_role_all" ON first_time_incentives
  FOR ALL USING (auth.role() = 'service_role');

-- updated_at トリガー
DROP TRIGGER IF EXISTS set_first_time_incentives_updated_at ON first_time_incentives;
CREATE TRIGGER set_first_time_incentives_updated_at
  BEFORE UPDATE ON first_time_incentives
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. member_coupons テーブル作成
CREATE TABLE IF NOT EXISTS member_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ DEFAULT now(),
  source TEXT DEFAULT 'first_time' CHECK (source IN ('first_time', 'campaign', 'manual', 'birthday', 'rank'))
);

ALTER TABLE member_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_coupons_select_own" ON member_coupons;
CREATE POLICY "member_coupons_select_own" ON member_coupons
  FOR SELECT USING (
    member_id IN (SELECT id FROM members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "member_coupons_insert_own" ON member_coupons;
CREATE POLICY "member_coupons_insert_own" ON member_coupons
  FOR INSERT WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "member_coupons_service_role_all" ON member_coupons;
CREATE POLICY "member_coupons_service_role_all" ON member_coupons
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_member_coupons_member ON member_coupons(member_id);
CREATE INDEX IF NOT EXISTS idx_member_coupons_coupon ON member_coupons(coupon_id);
