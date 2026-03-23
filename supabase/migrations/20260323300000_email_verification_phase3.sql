-- ============================================================
-- Email Verification Phase 3: Existing member grace period
-- ============================================================

-- 1. Add grace period tracking columns to members
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS verification_grace_sent_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_grace_expires_at TIMESTAMPTZ DEFAULT NULL;

-- verification_grace_sent_at: when the bulk verification email was sent
-- verification_grace_expires_at: 30 days after sent_at; after this date, show banner

-- 2. Index for querying unverified existing members
CREATE INDEX IF NOT EXISTS idx_members_verification_grace
  ON members(verification_grace_expires_at)
  WHERE verification_grace_expires_at IS NOT NULL;

-- 3. Function: Send bulk verification emails to existing unverified members
--    This marks members for grace period tracking.
--    Actual email sending is done via the API endpoint (Supabase Auth generateLink).
CREATE OR REPLACE FUNCTION mark_existing_unverified_for_grace(
  batch_limit INTEGER DEFAULT 100
)
RETURNS TABLE(member_id UUID, member_email TEXT, auth_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE members m
  SET
    verification_grace_sent_at = NOW(),
    verification_grace_expires_at = NOW() + INTERVAL '30 days'
  FROM auth.users au
  WHERE au.id = m.auth_user_id
    AND au.email_confirmed_at IS NULL
    AND m.verification_grace_sent_at IS NULL
    AND m.withdrawal_status IS DISTINCT FROM 'withdrawn'
  RETURNING m.id AS member_id, m.email AS member_email, m.auth_user_id;
END;
$$;

-- 4. Helper view: count of unverified existing members (for admin dashboard)
CREATE OR REPLACE VIEW v_unverified_existing_members AS
SELECT
  m.id,
  m.email,
  m.first_name,
  m.last_name,
  m.created_at,
  m.verification_grace_sent_at,
  m.verification_grace_expires_at,
  CASE
    WHEN m.verification_grace_expires_at IS NOT NULL
         AND m.verification_grace_expires_at < NOW()
    THEN 'grace_expired'
    WHEN m.verification_grace_sent_at IS NOT NULL
    THEN 'grace_active'
    ELSE 'not_notified'
  END AS grace_status
FROM members m
JOIN auth.users au ON au.id = m.auth_user_id
WHERE au.email_confirmed_at IS NULL
  AND m.withdrawal_status IS DISTINCT FROM 'withdrawn';
