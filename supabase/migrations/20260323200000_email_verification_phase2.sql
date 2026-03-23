-- ============================================================
-- Email Verification Phase 2: Resend tracking + Auto-cleanup
-- ============================================================

-- 1. Add resend tracking columns to members
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_verification_resend_count INTEGER DEFAULT 0;

-- 2. Index for cleanup query (find unverified members older than 24h)
CREATE INDEX IF NOT EXISTS idx_members_email_verification_sent_at
  ON members(email_verification_sent_at)
  WHERE email_verification_sent_at IS NOT NULL;

-- 3. Function: Delete expired unverified accounts (24h+)
CREATE OR REPLACE FUNCTION cleanup_unverified_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER := 0;
  rec RECORD;
BEGIN
  -- Find members who:
  --   a) have no confirmed email in auth.users
  --   b) were created more than 24 hours ago
  FOR rec IN
    SELECT m.id AS member_id, m.auth_user_id, m.email
    FROM members m
    JOIN auth.users au ON au.id = m.auth_user_id
    WHERE au.email_confirmed_at IS NULL
      AND m.created_at < NOW() - INTERVAL '24 hours'
  LOOP
    -- Log to audit_logs before deletion
    INSERT INTO audit_logs (action, target_table, target_id, user_email, details)
    VALUES (
      'unverified_account_deleted',
      'members',
      rec.member_id,
      rec.email,
      jsonb_build_object(
        'reason', 'Email not verified within 24 hours',
        'auth_user_id', rec.auth_user_id::text
      )
    );

    -- Delete the member record (cascades handled by FK)
    DELETE FROM members WHERE id = rec.member_id;

    -- Delete the auth user
    DELETE FROM auth.users WHERE id = rec.auth_user_id;

    deleted_count := deleted_count + 1;
  END LOOP;

  -- Log summary
  IF deleted_count > 0 THEN
    RAISE NOTICE 'cleanup_unverified_accounts: Deleted % expired unverified account(s)', deleted_count;
  END IF;

  RETURN deleted_count;
END;
$$;

-- 4. pg_cron job: Run daily at UTC 19:00 (= JST 4:00)
SELECT cron.schedule(
  'cleanup-unverified-accounts',
  '0 19 * * *',
  $$SELECT cleanup_unverified_accounts()$$
);
