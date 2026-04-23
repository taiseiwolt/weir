-- CC-Menu-Schema-Fix Migration 2/4
-- Adds auto-generated DEFAULT to products.display_id (previously NOT NULL with no default).
-- Pattern matches brands (BRD-) / venues — see 20260402100000_admin_display_ids.sql.

BEGIN;

ALTER TABLE products
  ALTER COLUMN display_id SET DEFAULT 'PRD-' || substr(md5(random()::text), 1, 7);

COMMIT;
