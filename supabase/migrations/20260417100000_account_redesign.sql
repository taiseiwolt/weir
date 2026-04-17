-- Account Management Redesign (4-table separation)
-- Date: 2026-04-17
-- Design: weir_staff / merchant_accounts / venue_accounts / merchant_account_permissions

BEGIN;

-- =========================================================
-- STEP 1: Backup (safety first)
-- =========================================================
CREATE TABLE _backup_accounts_20260417 AS SELECT * FROM accounts;
CREATE TABLE _backup_staff_accounts_20260417 AS SELECT * FROM staff_accounts;
CREATE TABLE _backup_corps_20260417 AS SELECT * FROM corps;

-- =========================================================
-- STEP 2: corps -> merchants data migration (preserve test data)
-- =========================================================
INSERT INTO merchants (id, name, hq_address, hq_phone, contact_email, contact_name, stripe_account_id, display_id, created_at, updated_at)
SELECT
  c.id,
  c.name,
  COALESCE(c.address, ''),
  c.phone,
  c.email,
  c.contact_name,
  c.stripe_account_id,
  c.display_id,
  c.created_at,
  c.created_at
FROM corps c
WHERE NOT EXISTS (SELECT 1 FROM merchants m WHERE m.id = c.id);

-- =========================================================
-- STEP 3: weir_staff table (Weir internal staff)
-- =========================================================
CREATE TABLE weir_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'weir_admin' CHECK (role IN ('weir_admin','weir_support')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  last_login timestamptz,
  display_id text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Migrate taisei@weir.co.jp from staff_accounts
INSERT INTO weir_staff (user_id, email, display_name, role, status, display_id, created_at, updated_at)
SELECT
  auth_user_id,
  email,
  display_name,
  'weir_admin',
  'active',
  'WST-' || substr(md5(id::text || clock_timestamp()::text), 1, 7),
  created_at,
  updated_at
FROM staff_accounts
WHERE email = 'taisei@weir.co.jp';

-- =========================================================
-- STEP 4: merchant_accounts table (merchant owners + HQ staff)
-- =========================================================
CREATE TABLE merchant_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('merchant_owner','merchant_hq_staff')),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  last_login timestamptz,
  display_id text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- STEP 5: merchant_account_permissions table
-- =========================================================
CREATE TABLE merchant_account_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_account_id uuid NOT NULL REFERENCES merchant_accounts(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid,
  UNIQUE(merchant_account_id, permission_key)
);
CREATE INDEX idx_mac_perms_account ON merchant_account_permissions(merchant_account_id);
CREATE INDEX idx_mac_perms_key ON merchant_account_permissions(permission_key);

-- =========================================================
-- STEP 6: accounts -> venue_accounts migration
-- =========================================================

-- WHY: 3 records have venue_id=NULL (stale test data for deprecated corps).
-- venue_accounts requires venue_id NOT NULL UNIQUE, so these cannot be migrated.
DELETE FROM accounts WHERE venue_id IS NULL;

-- Drop existing RLS policies on accounts (if any) before rename
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'accounts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON accounts', pol.policyname);
  END LOOP;
END $$;

-- Rename table
ALTER TABLE accounts RENAME TO venue_accounts;

-- Rename column name -> display_name
ALTER TABLE venue_accounts RENAME COLUMN name TO display_name;

-- Add new columns
ALTER TABLE venue_accounts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE venue_accounts ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE venue_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill user_id (existing convention: accounts.id == auth.users.id)
UPDATE venue_accounts SET user_id = id WHERE user_id IS NULL;

-- Backfill merchant_id from venue's merchant_id
UPDATE venue_accounts va SET merchant_id = v.merchant_id
FROM venues v WHERE va.venue_id = v.id AND va.merchant_id IS NULL;

-- Backfill display_id
UPDATE venue_accounts SET display_id = 'VAC-' || substr(md5(id::text), 1, 7)
WHERE display_id IS NULL;

-- Backfill display_name (ensure NOT NULL)
UPDATE venue_accounts SET display_name = COALESCE(NULLIF(display_name, ''), email)
WHERE display_name IS NULL OR display_name = '';

-- Drop columns that don't belong in venue_accounts
ALTER TABLE venue_accounts DROP COLUMN IF EXISTS role;
ALTER TABLE venue_accounts DROP COLUMN IF EXISTS brand_id;

-- Apply NOT NULL + UNIQUE constraints
ALTER TABLE venue_accounts ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE venue_accounts ADD CONSTRAINT venue_accounts_display_id_key UNIQUE (display_id);
ALTER TABLE venue_accounts ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE venue_accounts ALTER COLUMN venue_id SET NOT NULL;
ALTER TABLE venue_accounts ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE venue_accounts ADD CONSTRAINT venue_accounts_venue_id_key UNIQUE (venue_id);
ALTER TABLE venue_accounts ALTER COLUMN email SET NOT NULL;

-- Status CHECK constraint
DO $$ BEGIN
  ALTER TABLE venue_accounts ADD CONSTRAINT venue_accounts_status_check CHECK (status IN ('active','suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Re-create FKs pointing to merchants/venues
DO $$
DECLARE fk_name text;
BEGIN
  FOR fk_name IN
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'venue_accounts' AND constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE 'ALTER TABLE venue_accounts DROP CONSTRAINT ' || quote_ident(fk_name);
  END LOOP;
END $$;

ALTER TABLE venue_accounts ADD CONSTRAINT venue_accounts_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
ALTER TABLE venue_accounts ADD CONSTRAINT venue_accounts_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

-- =========================================================
-- STEP 7: FK replacement for invoices / sns_posts / sns_connections
-- (All 0 records, so FK swap is safe)
-- =========================================================
DO $$ DECLARE fk_name text; BEGIN
  FOR fk_name IN
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'invoices' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%merchant%'
  LOOP
    EXECUTE 'ALTER TABLE invoices DROP CONSTRAINT ' || quote_ident(fk_name);
  END LOOP;
END $$;
ALTER TABLE invoices ADD CONSTRAINT invoices_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;

DO $$ DECLARE fk_name text; BEGIN
  FOR fk_name IN
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'sns_posts' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%brand%'
  LOOP
    EXECUTE 'ALTER TABLE sns_posts DROP CONSTRAINT ' || quote_ident(fk_name);
  END LOOP;
END $$;
ALTER TABLE sns_posts ADD CONSTRAINT sns_posts_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;

DO $$ DECLARE fk_name text; BEGIN
  FOR fk_name IN
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'sns_connections' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%brand%'
  LOOP
    EXECUTE 'ALTER TABLE sns_connections DROP CONSTRAINT ' || quote_ident(fk_name);
  END LOOP;
END $$;
ALTER TABLE sns_connections ADD CONSTRAINT sns_connections_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;

-- =========================================================
-- STEP 8a: Drop RLS policies that subquery staff_accounts
-- WHY: PostgreSQL does not cascade DROP TABLE to subquery references in
-- other tables' policies, so these must be removed before staff_accounts goes.
-- =========================================================
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual LIKE '%staff_accounts%' OR with_check LIKE '%staff_accounts%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- =========================================================
-- STEP 8b: Drop old tables
-- =========================================================
DROP TABLE staff_accounts;
DROP TABLE corps;

-- =========================================================
-- STEP 9: RLS Policies
-- =========================================================

-- weir_staff
ALTER TABLE weir_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weir_staff_service_role_all" ON weir_staff
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "weir_staff_select_own" ON weir_staff
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- merchant_accounts
ALTER TABLE merchant_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchant_accounts_service_role_all" ON merchant_accounts
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "merchant_accounts_select_own" ON merchant_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "merchant_accounts_select_same_merchant" ON merchant_accounts
  FOR SELECT TO authenticated
  USING (merchant_id IN (
    SELECT merchant_id FROM merchant_accounts
    WHERE user_id = auth.uid()
      AND role IN ('merchant_owner','merchant_hq_staff')
      AND status = 'active'
  ));

-- venue_accounts
ALTER TABLE venue_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_accounts_service_role_all" ON venue_accounts
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "venue_accounts_select_own" ON venue_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "venue_accounts_select_same_merchant" ON venue_accounts
  FOR SELECT TO authenticated
  USING (merchant_id IN (
    SELECT merchant_id FROM merchant_accounts
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- merchant_account_permissions
ALTER TABLE merchant_account_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mac_perms_service_role_all" ON merchant_account_permissions
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "mac_perms_select_own" ON merchant_account_permissions
  FOR SELECT TO authenticated
  USING (merchant_account_id IN (
    SELECT id FROM merchant_accounts WHERE user_id = auth.uid() AND status = 'active'
  ));

COMMIT;
