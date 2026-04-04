-- ============================================================
-- Phase 0 Seed: fee_schedules base rates + platform_settings
-- Idempotent: uses WHERE NOT EXISTS / ON CONFLICT
-- ============================================================

-- 1. fee_schedules: base fee rates for ALL corporations
--    dinein=3.80%, takeout=4.00%, delivery=4.00%
INSERT INTO fee_schedules (corporation_id, fee_type, rate, is_base, effective_from)
SELECT c.id, t.fee_type, t.rate, true, CURRENT_DATE
FROM corporations c
CROSS JOIN (VALUES
  ('dinein',   0.0380),
  ('takeout',  0.0400),
  ('delivery', 0.0400)
) AS t(fee_type, rate)
WHERE NOT EXISTS (
  SELECT 1 FROM fee_schedules fs
  WHERE fs.corporation_id = c.id
    AND fs.fee_type = t.fee_type
    AND fs.is_base = true
);

-- 2. platform_settings: initial configuration
INSERT INTO platform_settings (key, value) VALUES
  ('platform_name', 'AIden'),
  ('admin_email', 'admin@aiden-jp.net'),
  ('timezone', 'Asia/Tokyo'),
  ('stripe_env', 'production')
ON CONFLICT (key) DO NOTHING;
