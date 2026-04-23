-- CC-22b-stage1 follow-up: generation_jobs を Realtime publication に追加
--
-- 背景:
--   20260423100000_cc22b_stage1_ai_generation.sql で anon の SELECT RLS は作成したが、
--   supabase_realtime publication への ADD TABLE が抜けていた。結果として
--   weir-onboarding.html の `sb.channel('weir-gen-' + jobId)` 購読が
--   postgres_changes UPDATE イベントを受信できず、フロントが loading 状態で
--   固まる（E2E T1/T5 が 30s タイムアウト）。
--
-- 効果:
--   generation_jobs の INSERT/UPDATE が Realtime で anon クライアントに
--   ブロードキャストされるようになる。
--   generation_results は Realtime 不要（完了後 SELECT のみ）なので追加しない。

ALTER PUBLICATION supabase_realtime ADD TABLE generation_jobs;
