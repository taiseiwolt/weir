-- ============================================================
-- 監視用RPCファンクション
-- Edge Function (monitor-usage) からメトリクスを取得するために使用
-- ============================================================

-- M-01: DB容量取得
CREATE OR REPLACE FUNCTION get_db_size()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database());
$$;

-- M-02: Storage使用量取得
CREATE OR REPLACE FUNCTION get_storage_size()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  FROM storage.objects
  WHERE metadata->>'size' IS NOT NULL;
$$;

-- M-03: DB接続数取得
CREATE OR REPLACE FUNCTION get_active_connections()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT count(*)::integer FROM pg_stat_activity WHERE state IS NOT NULL;
$$;

-- M-05: 月間アクティブユーザー数取得
CREATE OR REPLACE FUNCTION get_monthly_active_users(since TIMESTAMPTZ DEFAULT date_trunc('month', NOW()))
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT count(*)::integer
  FROM auth.users
  WHERE last_sign_in_at >= since;
$$;

-- service_role のみ実行可能にする
REVOKE EXECUTE ON FUNCTION get_db_size() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_storage_size() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_active_connections() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_monthly_active_users(TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_db_size() TO service_role;
GRANT EXECUTE ON FUNCTION get_storage_size() TO service_role;
GRANT EXECUTE ON FUNCTION get_active_connections() TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_active_users(TIMESTAMPTZ) TO service_role;
