-- CC-Menu-Schema-Fix Migration 3/4
-- D-47: unify product_flags allowed values from '一番人気' to '人気' (Q-c = Y).
-- 1. Rewrite any existing '一番人気' → '人気' (production currently 0 rows; defensive).
-- 2. Enforce CHECK constraint restricting product_flags to the canonical set.

BEGIN;

UPDATE products
SET product_flags = REPLACE(product_flags::text, '一番人気', '人気')::jsonb
WHERE product_flags::text LIKE '%一番人気%';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_flags_check;
ALTER TABLE products ADD CONSTRAINT products_product_flags_check
  CHECK (product_flags <@ '["おすすめ", "新商品", "期間限定", "人気"]'::jsonb);

COMMENT ON COLUMN products.product_flags IS 'Product flag tags as JSON array. Allowed: おすすめ / 新商品 / 期間限定 / 人気 (D-47, CC-Menu-Schema-Fix).';

COMMIT;
