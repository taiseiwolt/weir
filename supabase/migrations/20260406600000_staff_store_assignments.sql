-- Phase 3: Staff multi-store assignment junction table
CREATE TABLE IF NOT EXISTS staff_store_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, store_id)
);

ALTER TABLE staff_store_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON staff_store_assignments TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "staff_store_auth_read" ON staff_store_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_store_auth_write" ON staff_store_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Make auth_user_id nullable for staff accounts (allows adding staff before auth account exists)
ALTER TABLE staff_accounts ALTER COLUMN auth_user_id DROP NOT NULL;
