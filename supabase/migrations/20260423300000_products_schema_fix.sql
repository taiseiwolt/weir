-- CC-Menu-Schema-Fix Migration 1/4
-- Adds price / is_available / sort_order / updated_at to products.
-- Production products = 0 rows (pre-launch), so DEFAULT backfill is instant.
-- Companion migrations: 300000 (this) → 400000 (display_id) → 500000 (product_flags CHECK) → 600000 (menu_patterns seed).

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS price int NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- update_updated_at_column() is defined in 20260408200000_template_catalog.sql.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_products_updated_at') THEN
    CREATE TRIGGER set_products_updated_at
      BEFORE UPDATE ON products
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMIT;
