-- Phase 2: Withdrawal Reservation Flow
-- Adds scheduled withdrawal support with 30-day grace period

-- 1. Add withdrawal_scheduled_at column to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS withdrawal_scheduled_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Update CHECK constraint to include 'active' status
ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_withdrawal_status;
ALTER TABLE members ADD CONSTRAINT chk_withdrawal_status CHECK (
  withdrawal_status IS NULL OR withdrawal_status IN ('active', 'pending', 'withdrawn')
);

-- 3. Add member_id column to existing audit_logs table
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_member_id ON audit_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 4. Add index for pending withdrawal lookups (used by cron batch)
CREATE INDEX IF NOT EXISTS idx_members_withdrawal_scheduled
  ON members(withdrawal_scheduled_at)
  WHERE withdrawal_status = 'pending' AND withdrawal_scheduled_at IS NOT NULL;

-- 5. Create the withdrawal completion batch function
CREATE OR REPLACE FUNCTION process_scheduled_withdrawals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_balance INTEGER;
  v_brand_id UUID;
BEGIN
  FOR v_member IN
    SELECT m.id, m.auth_user_id, m.withdrawal_scheduled_at
    FROM members m
    WHERE m.withdrawal_status = 'pending'
      AND m.withdrawal_scheduled_at IS NOT NULL
      AND m.withdrawal_scheduled_at <= NOW()
  LOOP
    -- 1. Calculate and expire points
    SELECT COALESCE(SUM(
      CASE
        WHEN amount > 0 AND expires_at IS NOT NULL AND expires_at < NOW() THEN 0
        ELSE amount
      END
    ), 0) INTO v_balance
    FROM point_transactions
    WHERE member_id = v_member.id;

    v_balance := GREATEST(v_balance, 0);

    IF v_balance > 0 THEN
      SELECT brand_id INTO v_brand_id
      FROM point_transactions
      WHERE member_id = v_member.id
      LIMIT 1;

      INSERT INTO point_transactions (member_id, brand_id, amount, balance_after, source, reason)
      VALUES (v_member.id, v_brand_id, -v_balance, 0, 'normal', '退会確定によるポイント失効');
    END IF;

    -- 2. Invalidate unused coupons
    UPDATE member_coupons
    SET is_used = true, used_at = NOW()
    WHERE member_id = v_member.id AND is_used = false;

    -- 3. Update member status to withdrawn
    UPDATE members
    SET withdrawal_status = 'withdrawn',
        withdrawal_completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_member.id;

    -- 4. Log to audit
    INSERT INTO audit_logs (member_id, action, details)
    VALUES (v_member.id, 'withdrawal_completed', jsonb_build_object(
      'points_expired', v_balance,
      'scheduled_at', v_member.withdrawal_scheduled_at
    ));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 6. Schedule pg_cron job: daily at UTC 18:00 (= JST 03:00)
SELECT cron.schedule(
  'process-scheduled-withdrawals',
  '0 18 * * *',
  $$SELECT process_scheduled_withdrawals()$$
);
