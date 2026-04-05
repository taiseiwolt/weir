-- ============================================================
-- Phase 2: Brand Extensions
-- brands追加カラム + brand_couponsテーブル
-- 2026-04-05
-- ============================================================

-- 1. brands テーブル拡張
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_unique ON brands (slug) WHERE slug IS NOT NULL;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS font_families TEXT[] DEFAULT ARRAY['Noto Sans JP'];
ALTER TABLE brands ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS service_settings JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS design_settings JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS hp_settings JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS cancel_policy JSONB DEFAULT '{"no_show":100,"same_day":100,"3_days_before":50}';

-- 2. brand_coupons テーブル
CREATE TABLE IF NOT EXISTS brand_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC NOT NULL,
  target_services TEXT[] DEFAULT ARRAY['dinein', 'takeout', 'delivery'],
  target_platforms TEXT[] DEFAULT ARRAY['aiden'],
  start_date DATE,
  end_date DATE,
  max_uses INT,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_coupons_brand_idx ON brand_coupons (brand_id);

ALTER TABLE brand_coupons ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_coupons' AND policyname = 'service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON brand_coupons FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_coupons' AND policyname = 'authenticated_read_active') THEN
    CREATE POLICY "authenticated_read_active" ON brand_coupons FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_brand_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brand_coupons_updated_at ON brand_coupons;
CREATE TRIGGER brand_coupons_updated_at
  BEFORE UPDATE ON brand_coupons
  FOR EACH ROW EXECUTE FUNCTION update_brand_coupons_updated_at();
