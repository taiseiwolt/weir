-- Store data model extension: genres array, regular_holiday, lunch/dinner price ranges
-- Prerequisite: stores table already has genre (TEXT), genre_sub (TEXT), price_range (TEXT)

-- 1. genres: multiple genre support (TEXT array)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}';

-- Migrate existing genre data
UPDATE stores SET genres = ARRAY[genre] WHERE genre IS NOT NULL AND genre != '' AND (genres IS NULL OR genres = '{}');

-- 2. regular_holiday: free-text holiday description
ALTER TABLE stores ADD COLUMN IF NOT EXISTS regular_holiday TEXT DEFAULT '';

-- 3. lunch/dinner separate price ranges
ALTER TABLE stores ADD COLUMN IF NOT EXISTS price_range_lunch TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS price_range_dinner TEXT DEFAULT '';

-- Migrate existing price_range to dinner (common default)
UPDATE stores SET price_range_dinner = price_range WHERE price_range IS NOT NULL AND price_range != '' AND (price_range_dinner IS NULL OR price_range_dinner = '');
