-- Add product_flags JSONB column to products table
-- Stores tag flags like: ["おすすめ", "新商品", "期間限定", "一番人気"]
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_flags JSONB DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN products.product_flags IS 'Product flag tags as JSON array (e.g. おすすめ, 新商品, 期間限定, 一番人気)';
