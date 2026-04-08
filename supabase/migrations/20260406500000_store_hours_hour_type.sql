-- Add hour_type column to store_hours for distinguishing regular/takeout/delivery hours
ALTER TABLE store_hours ADD COLUMN IF NOT EXISTS hour_type TEXT DEFAULT 'regular' CHECK (hour_type IN ('regular', 'takeout', 'delivery'));

-- Add index for efficient querying by hour_type
CREATE INDEX IF NOT EXISTS idx_store_hours_hour_type ON store_hours (store_id, hour_type);
