-- All existing brands are marked as draft (HP not published by default).
-- D-83: brand HP must be explicitly published via admin UI — no blanket auto-publish.
-- Preserves other hp_settings keys (metaDescription, ogImage, favicon, customDomain).

UPDATE brands
SET hp_settings = COALESCE(hp_settings, '{}'::jsonb) || '{"status":"draft"}'::jsonb
WHERE COALESCE(hp_settings->>'status', '') <> 'draft';
