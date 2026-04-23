-- CC-Menu-Schema-Fix Migration 4/4
-- Seeds the default menu_pattern for brand izakaya-ushio so products can be inserted
-- (products.menu_pattern_id is NOT NULL FK). Idempotent via UNIQUE(brand_id, code).
-- menu_patterns has no sort_order column; is_active defaults to true.

INSERT INTO menu_patterns (brand_id, code, name)
SELECT id, 'default', '通常メニュー'
FROM brands
WHERE slug = 'izakaya-ushio'
ON CONFLICT (brand_id, code) DO NOTHING;
