-- Migration: Extend products.sale_status + add updated_by column
-- Date: 2026-04-06
-- Purpose: Support discontinued / sold_out_today statuses and track who changed sale_status

-- 1. Drop existing CHECK constraint on sale_status (if any)
DO $$
BEGIN
  -- Find and drop any CHECK constraint on sale_status
  PERFORM 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid
    AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'products'::regclass
    AND c.contype = 'c'
    AND a.attname = 'sale_status';

  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE products DROP CONSTRAINT ' || c.conname
      FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid
        AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'products'::regclass
        AND c.contype = 'c'
        AND a.attname = 'sale_status'
      LIMIT 1
    );
  END IF;
END $$;

-- 2. Add new CHECK constraint with extended values
ALTER TABLE products
  ADD CONSTRAINT products_sale_status_check
  CHECK (sale_status IN ('on_sale', 'sold_out', 'discontinued', 'sold_out_today'));

-- 3. Add updated_by column (tracks who changed sale_status: store / admin / merchant)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS updated_by TEXT DEFAULT NULL;

-- 4. Migrate legacy sold_out → discontinued
UPDATE products SET sale_status = 'discontinued' WHERE sale_status = 'sold_out';
