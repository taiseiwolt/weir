-- ============================================================
-- Fix: auth.users exposed through view (Security Advisor alert)
-- ============================================================
-- 問題: v_unverified_existing_members ビューが auth.users を直接JOINしており、
--       anon/authenticated ロールから auth.users のデータにアクセス可能になっていた。
-- 対策:
--   1. ビューを削除し、SECURITY DEFINER 関数に置き換える（service_role のみ実行可能）
--   2. auth.users を参照する他の関数のアクセス制御を強化

-- ============================================================
-- 1. v_unverified_existing_members ビューを削除
-- ============================================================
DROP VIEW IF EXISTS v_unverified_existing_members;

-- 代替: SECURITY DEFINER 関数として再実装（service_role のみ実行可能）
CREATE OR REPLACE FUNCTION get_unverified_existing_members()
RETURNS TABLE(
  id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ,
  verification_grace_sent_at TIMESTAMPTZ,
  verification_grace_expires_at TIMESTAMPTZ,
  grace_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
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
END;
$$;

-- service_role のみ実行可能
REVOKE EXECUTE ON FUNCTION get_unverified_existing_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unverified_existing_members() TO service_role;

-- ============================================================
-- 2. mark_existing_unverified_for_grace 関数のアクセス制御強化
--    （SECURITY DEFINER だが REVOKE がなかった）
-- ============================================================
REVOKE EXECUTE ON FUNCTION mark_existing_unverified_for_grace(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_existing_unverified_for_grace(INTEGER) TO service_role;

-- ============================================================
-- 3. cleanup_unverified_accounts 関数のアクセス制御強化
-- ============================================================
REVOKE EXECUTE ON FUNCTION cleanup_unverified_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_unverified_accounts() TO service_role;

-- ============================================================
-- 4. anonymize_withdrawn_members 関数のアクセス制御強化
-- ============================================================
REVOKE EXECUTE ON FUNCTION anonymize_withdrawn_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION anonymize_withdrawn_members() TO service_role;
