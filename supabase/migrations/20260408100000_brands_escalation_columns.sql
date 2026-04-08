-- ============================================================
-- Add escalation settings columns to brands table
-- 2026-04-08
-- ============================================================

ALTER TABLE brands ADD COLUMN IF NOT EXISTS escalation_email TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS escalation_slack_webhook TEXT;
