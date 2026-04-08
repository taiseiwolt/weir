-- Phase 8: Brand HP settings columns
-- Note: Most settings are stored in existing JSONB columns (design_settings, hp_settings)
-- Only hp_published needs a dedicated boolean column for easy querying

ALTER TABLE brands ADD COLUMN IF NOT EXISTS hp_published BOOLEAN DEFAULT true;

COMMENT ON COLUMN brands.hp_published IS 'Whether the brand HP is publicly accessible';
