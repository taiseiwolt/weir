-- =============================================================================
-- CC-22b-stage1: AI 生成基盤 モニタリング SQL 集
--
-- Stage 1 は手動確認。Stage 2 で pg_cron + Slack/Resend 通知に自動化予定。
--
-- 使い方:
--   Supabase SQL Editor で必要なセクションをコピペして実行。
--   各セクションは独立して動作する。
-- =============================================================================


-- ============================================================
-- 1. 過去 24 時間のジョブステータス分布
-- ============================================================

SELECT status, COUNT(*) AS count
FROM generation_jobs
WHERE created_at > now() - interval '1 day'
GROUP BY status
ORDER BY count DESC;


-- ============================================================
-- 2. エラーコード別件数 (失敗ジョブの内訳)
-- ============================================================

SELECT error_code, COUNT(*) AS count
FROM generation_jobs
WHERE status = 'failed'
  AND created_at > now() - interval '1 day'
GROUP BY error_code
ORDER BY count DESC;


-- ============================================================
-- 3. 処理時間分布 (成功ジョブの p50 / p95 / p99)
-- ============================================================

SELECT
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))) AS p50_sec,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))) AS p95_sec,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))) AS p99_sec,
  COUNT(*) AS completed_count
FROM generation_jobs
WHERE status = 'completed'
  AND started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND created_at > now() - interval '1 day';


-- ============================================================
-- 4. 業態 (cuisine_key) 別の生成量
-- ============================================================

SELECT
  cuisine_key,
  COUNT(*) FILTER (WHERE status = 'completed') AS succeeded,
  COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
  COUNT(*) AS total
FROM generation_jobs
WHERE created_at > now() - interval '7 days'
GROUP BY cuisine_key
ORDER BY total DESC;


-- ============================================================
-- 5. リトライ統計 (retry_count の分布)
-- ============================================================

SELECT
  retry_count,
  status,
  COUNT(*) AS count
FROM generation_jobs
WHERE created_at > now() - interval '1 day'
GROUP BY retry_count, status
ORDER BY retry_count, status;


-- ============================================================
-- 6. コスト集計 (ai_usage_logs 経由、Claude Sonnet 4.6 単価ベース)
-- ============================================================

-- Claude Sonnet 4.6: $3 / 1M input tokens, $15 / 1M output tokens
-- Stage 1 は全件 review_reply_onboarding_preview
SELECT
  DATE_TRUNC('day', created_at)::date AS day,
  COUNT(*) AS request_count,
  SUM(input_tokens)  AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  ROUND(
    (SUM(input_tokens)  * 3.0  / 1000000.0) +
    (SUM(output_tokens) * 15.0 / 1000000.0),
    4
  ) AS estimated_cost_usd
FROM ai_usage_logs
WHERE feature = 'review_reply_onboarding_preview'
  AND created_at > now() - interval '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;


-- ============================================================
-- 7. Rate Limit 超過検知 (直近 1 時間の IP / session / venue の超過状況)
-- ============================================================

WITH recent AS (
  SELECT key_type, key_value, called_at
  FROM rate_limits
  WHERE called_at > now() - interval '1 hour'
),
grouped AS (
  SELECT
    key_type,
    key_value,
    COUNT(*) FILTER (WHERE called_at > now() - interval '1 minute') AS last_min,
    COUNT(*) AS last_hour
  FROM recent
  GROUP BY key_type, key_value
)
SELECT key_type, key_value, last_min, last_hour
FROM grouped
WHERE last_min >= 3 OR last_hour >= 20
ORDER BY last_min DESC, last_hour DESC
LIMIT 50;


-- ============================================================
-- 8. Stuck ジョブ検出 (running のまま 2 分以上放置)
-- ============================================================

SELECT
  id,
  status,
  cuisine_key,
  tone,
  retry_count,
  started_at,
  EXTRACT(EPOCH FROM (now() - started_at))::int AS stuck_seconds,
  error_code,
  error_message
FROM generation_jobs
WHERE status = 'running'
  AND started_at < now() - interval '2 minutes'
ORDER BY started_at ASC;


-- ============================================================
-- 9. 異常検知の閾値チェック (Stage 1 は目視、Stage 2 で自動化)
-- ============================================================

-- エラー率 > 5% の警戒ライン
WITH daily AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed') AS ok,
    COUNT(*) FILTER (WHERE status = 'failed')    AS ng,
    COUNT(*) AS total
  FROM generation_jobs
  WHERE created_at > now() - interval '1 day'
)
SELECT
  total,
  ok,
  ng,
  CASE WHEN total = 0 THEN 0 ELSE ROUND(100.0 * ng / total, 2) END AS error_rate_pct,
  CASE
    WHEN total = 0                      THEN 'no_data'
    WHEN ng::float / total > 0.05       THEN 'WARN: error rate > 5%'
    ELSE 'OK'
  END AS status_label
FROM daily;


-- ============================================================
-- 10. 孤児 generation_results (親 generation_jobs なし、ON DELETE CASCADE 検証)
-- ============================================================

SELECT gr.id, gr.job_id, gr.created_at
FROM generation_results gr
LEFT JOIN generation_jobs gj ON gj.id = gr.job_id
WHERE gj.id IS NULL
LIMIT 20;
