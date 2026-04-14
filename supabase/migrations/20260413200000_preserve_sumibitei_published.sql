-- Preserve 炭火亭 HP as published so existing customer-facing URL stays live.
-- Companion to 20260413100000_brand_hp_draft_default.sql, which blanket-sets
-- existing brands to draft. 炭火亭 is the already-public demo brand and must
-- not be taken offline by that migration.

UPDATE brands
SET hp_settings = COALESCE(hp_settings, '{}'::jsonb) || '{"status":"published"}'::jsonb
WHERE name = '焼肉 炭火亭';
