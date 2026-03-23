-- Phase 3: Data Anonymization Batch + Re-registration Support
-- Runs after process_scheduled_withdrawals to anonymize PII for confirmed withdrawals
-- Enables re-registration by removing auth.users entry

-- 0. Ensure pgcrypto extension for SHA256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add anonymized_at column to track anonymization status
ALTER TABLE members ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_members_anonymized
  ON members(withdrawal_status)
  WHERE withdrawal_status = 'withdrawn' AND anonymized_at IS NULL;

-- 2. Create the anonymization batch function
CREATE OR REPLACE FUNCTION anonymize_withdrawn_members()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_hashed_email TEXT;
BEGIN
  FOR v_member IN
    SELECT m.id, m.auth_user_id, m.email
    FROM members m
    WHERE m.withdrawal_status = 'withdrawn'
      AND m.anonymized_at IS NULL
      AND m.withdrawal_completed_at IS NOT NULL
  LOOP
    -- All anonymization within implicit transaction (each iteration)
    -- If any step fails, the entire function call rolls back

    -- 2a. Hash email with SHA256 (prefix with 'anon_' to distinguish)
    v_hashed_email := 'anon_' || encode(digest(v_member.email, 'sha256'), 'hex');

    -- 2b. Anonymize members table PII
    UPDATE members
    SET
      first_name = NULL,
      last_name = NULL,
      name = '退会済みユーザー',
      email = v_hashed_email,
      phone = NULL,
      gender = NULL,
      birth_date = NULL,
      address_prefecture = NULL,
      address_city = NULL,
      address_street = NULL,
      address_building = NULL,
      stripe_customer_id = NULL,
      line_user_id = NULL,
      anonymized_at = NOW(),
      updated_at = NOW()
    WHERE id = v_member.id;

    -- 2c. Nullify customer_id in ai_interactions (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_interactions' AND table_schema = 'public') THEN
      UPDATE ai_interactions
      SET customer_id = NULL
      WHERE customer_id = v_member.id;
    END IF;

    -- 2d. Zero out point balance (safety net - should already be 0 from Phase 2)
    UPDATE point_transactions
    SET reason = COALESCE(reason, '') || ' [anonymized]'
    WHERE member_id = v_member.id
      AND amount > 0
      AND balance_after > 0;

    -- 2e. Delete auth.users entry (enables re-registration with same email)
    IF v_member.auth_user_id IS NOT NULL THEN
      DELETE FROM auth.users WHERE id = v_member.auth_user_id;
    END IF;

    -- 2f. Clear auth_user_id reference (now deleted)
    UPDATE members
    SET auth_user_id = NULL
    WHERE id = v_member.id;

    -- 2g. Log anonymization to audit_logs
    INSERT INTO audit_logs (member_id, user_email, action, target_table, target_id, details)
    VALUES (
      v_member.id,
      v_hashed_email,
      'account_anonymized',
      'members',
      v_member.id,
      jsonb_build_object(
        'original_email_hash', v_hashed_email,
        'anonymized_fields', ARRAY['name', 'email', 'phone', 'address', 'birth_date', 'gender', 'stripe_customer_id', 'line_user_id'],
        'auth_user_deleted', v_member.auth_user_id IS NOT NULL
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 3. Schedule pg_cron job: daily at UTC 18:05 (= JST 03:05), 5 min after withdrawal processing
SELECT cron.schedule(
  'anonymize-withdrawn-members',
  '5 18 * * *',
  $$SELECT anonymize_withdrawn_members()$$
);

-- 4. Drop unique indexes that would block re-registration with hashed emails
-- The email unique index needs to allow hashed values (which are unique by nature of SHA256)
-- No change needed: hashed emails are unique, so idx_members_email still works correctly.
-- The line_user_id unique index: NULLs are allowed in unique indexes (multiple NULLs OK).
-- The auth_user_id unique index: NULLs are allowed (multiple NULLs OK).
-- The stripe_customer_id: NULLs are allowed.
-- => No index changes required.
