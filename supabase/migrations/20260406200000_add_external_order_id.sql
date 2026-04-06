-- Add external_order_id column for third-party platform order IDs
-- (UberEats, Demaecan, etc.)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id TEXT DEFAULT NULL;
COMMENT ON COLUMN orders.external_order_id IS '外部媒体の注文番号（UberEats/出前館等のAPIから取得した注文ID）';
