-- ============================================================
-- Phase 3: Store/User/BAN Extensions
-- store_tables作成 + user_bans拡張
-- 2026-04-05
-- ============================================================

-- 1. store_tables（テーブル管理）
CREATE TABLE IF NOT EXISTS store_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_number INT NOT NULL,
  table_name TEXT,
  capacity INT NOT NULL DEFAULT 2,
  floor TEXT DEFAULT '1F',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, table_number)
);

CREATE INDEX IF NOT EXISTS store_tables_store_idx ON store_tables (store_id);

ALTER TABLE store_tables ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='store_tables' AND policyname='service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON store_tables FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. user_bans 拡張（is_active, expires_at, unbanned_at, unban_reason追加）
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS unbanned_at DATE;
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS unban_reason TEXT;

-- anon/authenticatedユーザーがBANチェックできるようread policyを追加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_bans' AND policyname='anon_read_active') THEN
    CREATE POLICY "anon_read_active" ON user_bans FOR SELECT TO anon
      USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_bans' AND policyname='authenticated_read_active') THEN
    CREATE POLICY "authenticated_read_active" ON user_bans FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;

-- 既存のis_active=nullレコードをtrueに更新
UPDATE user_bans SET is_active = true WHERE is_active IS NULL;

-- 3. stores テーブル施設カラム追加
ALTER TABLE stores ADD COLUMN IF NOT EXISTS seats INT DEFAULT 6;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smoking_policy TEXT DEFAULT 'no_smoking';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS children_policy TEXT DEFAULT 'not_allowed';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS service_charge_type TEXT DEFAULT 'percent';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS service_charge_value NUMERIC DEFAULT 10;
