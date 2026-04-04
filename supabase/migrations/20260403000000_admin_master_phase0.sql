-- ============================================================
-- Phase 0: Admin Master Tables
-- fee_schedules, user_bans, brand_permissions,
-- platform_settings, menu_patterns + audit_logs extension
-- ============================================================

-- 1. fee_schedules（法人別手数料）
CREATE TABLE IF NOT EXISTS fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corporation_id UUID NOT NULL REFERENCES corporations(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('dinein', 'takeout', 'delivery')),
  rate DECIMAL(5,4) NOT NULL,
  is_base BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_schedules_base
  ON fee_schedules (corporation_id, fee_type) WHERE is_base = true;

ALTER TABLE fee_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON fee_schedules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. user_bans（BAN管理）
CREATE TABLE IF NOT EXISTS user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('member', 'guest')),
  target_id UUID,
  target_email TEXT,
  target_phone TEXT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'corporation', 'brand', 'store')),
  scope_id UUID,
  ban_type TEXT NOT NULL CHECK (ban_type IN ('service_specific', 'all_except_dinein')),
  banned_services JSONB DEFAULT '[]',
  reason TEXT,
  banned_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON user_bans FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. brand_permissions（FC対応ブランド権限）
CREATE TABLE IF NOT EXISTS brand_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, brand_id)
);

ALTER TABLE brand_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON brand_permissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_own" ON brand_permissions FOR SELECT TO authenticated
  USING (account_id IN (SELECT id FROM staff_accounts WHERE auth_user_id = auth.uid()));

-- 4. audit_logs ALTER（既存テーブル拡張）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'actor_id') THEN
    ALTER TABLE audit_logs ADD COLUMN actor_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'actor_email') THEN
    ALTER TABLE audit_logs ADD COLUMN actor_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_type') THEN
    ALTER TABLE audit_logs ADD COLUMN entity_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_id') THEN
    ALTER TABLE audit_logs ADD COLUMN entity_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'ip_address') THEN
    ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'log_level') THEN
    ALTER TABLE audit_logs ADD COLUMN log_level TEXT DEFAULT 'INFO' CHECK (log_level IN ('INFO', 'WARN', 'ERR'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_log_level ON audit_logs (log_level);

-- 5. platform_settings（プラットフォーム設定）
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON platform_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. menu_patterns（メニューパターン管理）
CREATE TABLE IF NOT EXISTS menu_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, code)
);

ALTER TABLE menu_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON menu_patterns FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_own_brands" ON menu_patterns FOR SELECT TO authenticated
  USING (
    brand_id IN (
      SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
      UNION
      SELECT brand_id FROM brand_permissions WHERE account_id IN (
        SELECT id FROM staff_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );
