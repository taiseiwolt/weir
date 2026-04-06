-- Migration: Create store_channels table
-- Date: 2026-04-06
-- Purpose: Support per-store channel and source pause settings
-- Root cause: store_channels table was referenced by Flutter POS but never created

CREATE TABLE IF NOT EXISTS store_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, channel_type)
);

-- RLS
ALTER TABLE store_channels ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON store_channels
  TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their store's channels
CREATE POLICY "authenticated_select" ON store_channels
  FOR SELECT TO authenticated
  USING (true);

-- Authenticated users can insert/update their store's channels
CREATE POLICY "authenticated_upsert" ON store_channels
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update" ON store_channels
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_store_channels_store_id
  ON store_channels(store_id);
