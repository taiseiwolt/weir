-- Phase 1: DB保存の致命的バグ修正 - マイグレーション
-- 実行: Supabase Dashboard > SQL Editor

-- 1. staff_accounts に status カラム追加 (修正13)
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended'));

-- 2. brand_contents テーブル作成 (修正4-5)
CREATE TABLE IF NOT EXISTS brand_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('recommend', 'guide', 'news')),
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT DEFAULT '',
  body TEXT DEFAULT '',
  category TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled')),
  publish_at TIMESTAMPTZ,
  publish_end TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brand_contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON brand_contents TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "brand_contents_auth_read" ON brand_contents FOR SELECT TO authenticated USING (true);
CREATE POLICY "brand_contents_auth_write" ON brand_contents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. crm_templates テーブル作成 (修正7)
CREATE TABLE IF NOT EXISTS crm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  content_type TEXT DEFAULT 'free',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON crm_templates TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "crm_templates_auth_read" ON crm_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_templates_auth_write" ON crm_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. sns_account_settings テーブル作成 (修正8-9)
CREATE TABLE IF NOT EXISTS sns_account_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_name TEXT DEFAULT '',
  profile_url TEXT DEFAULT '',
  manager_name TEXT DEFAULT '',
  start_date DATE,
  auto_post_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand_id, platform)
);

ALTER TABLE sns_account_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON sns_account_settings TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "sns_settings_auth_read" ON sns_account_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "sns_settings_auth_write" ON sns_account_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
