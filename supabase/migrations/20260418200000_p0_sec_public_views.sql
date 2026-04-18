-- ============================================================
-- P0 セキュリティ対策: venues_public / brands_public ビュー作成
-- 作成日: 2026-04-18
-- 目的: D-157 で判明した anon への PII・決済ID 露出を解消する
-- 方針:
--   1. venues_public / brands_public ビューを作成（公開 OK 列のみ）
--   2. 元テーブル venues / brands への anon SELECT を完全削除
--   3. anon / authenticated は新ビュー経由でアクセス
--   4. service_role は従来通り元テーブル直接アクセス可能
--   5. suspended / is_paused 行は venues_public から完全除外
-- ============================================================

-- ============================================================
-- STEP 0: 現状把握（破壊的操作なし、実行前の確認用）
-- ============================================================

-- 0-1. venues / brands の現行 RLS ポリシー一覧（DROP 前の状態記録）
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('venues', 'brands')
ORDER BY tablename, policyname;

-- 0-2. venues / brands の RLS 有効化状況
SELECT
  n.nspname AS schema,
  c.relname AS table,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('venues', 'brands');

-- 0-3. venues / brands の anon / authenticated GRANT 状況
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('venues', 'brands')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 0-4. 既存 venues_public / brands_public ビューが存在しないことを確認（期待: 0 件）
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('venues_public', 'brands_public');

-- 0-5. 件数記録（migration 後と比較するため）
SELECT 'venues total rows (service_role 実行時の件数)' AS metric, COUNT(*)::text AS value FROM public.venues
UNION ALL
SELECT 'venues active & not-paused rows (venues_public 予定件数)', COUNT(*)::text
  FROM public.venues
  WHERE status = 'active' AND (is_paused IS NULL OR is_paused = false)
UNION ALL
SELECT 'brands total rows (brands_public 予定件数)', COUNT(*)::text FROM public.brands;


-- ============================================================
-- STEP 1: venues_public ビュー作成
-- ============================================================
-- 公開 OK 列のみ含める。status='active' AND is_paused IS NOT TRUE でフィルタ。
-- 除外列: stripe_account_id, merchant_id, email, status, is_paused,
--         auto_accept_orders, reservation_confirmation_mode,
--         reservation_alert_minutes, extra_prep_time, auto_reset_time

CREATE OR REPLACE VIEW public.venues_public AS
SELECT
  id,
  brand_id,
  display_id,
  slug,
  name,
  address,
  phone,
  genre,
  genres,
  lat,
  lng,
  google_place_id,
  nearest_station,
  created_at,
  updated_at,
  has_takeout,
  has_delivery,
  reservation_enabled,
  seat_only_reservation,
  store_request_enabled,
  delivery_radius_km,
  delivery_fee,
  min_order_amount,
  delivery_time_min,
  delivery_time_max,
  free_delivery_threshold,
  small_order_surcharge_max,
  min_order_policy,
  min_order_apply_types,
  prep_time_minutes,
  cancel_no_show,
  cancel_same_day,
  cancel_3days,
  reservation_require_card,
  reservation_cancellation_fee,
  reservation_cancel_deadline_hours,
  max_reservation_capacity,
  seats,
  smoking_policy,
  children_policy,
  regular_holiday,
  price_range_lunch,
  price_range_dinner,
  service_charge_rate,
  service_charge_type,
  service_charge_value,
  spot_closed_until,
  menu_pattern_id
FROM public.venues
WHERE status = 'active'
  AND (is_paused IS NULL OR is_paused = false);

COMMENT ON VIEW public.venues_public IS
  'P0 セキュリティ対策(2026-04-18): anon 向け公開 OK 列のみ。除外=stripe_account_id/merchant_id/email/内部動作設定。suspended・paused 行は WHERE で除外。';

-- STEP 1a: anon / authenticated に SELECT 権限付与
GRANT SELECT ON public.venues_public TO anon, authenticated;


-- ============================================================
-- STEP 1b: venues 元テーブルから anon SELECT を完全除去
-- ============================================================

-- anon に付与されている policy を全削除（SELECT / ALL 系）
-- WHY: D-157 で anon が全列 SELECT 可能な状態を解消するため
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'venues'
      AND (
        'anon' = ANY(roles)
        OR 'public' = ANY(roles)
      )
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.venues', pol.policyname);
    RAISE NOTICE 'Dropped policy % on venues', pol.policyname;
  END LOOP;
END $$;

-- テーブル GRANT レベルでも anon への SELECT を剥奪
REVOKE SELECT ON public.venues FROM anon;
REVOKE SELECT ON public.venues FROM PUBLIC;

-- RLS が無効な場合は有効化（anon への default allow を止める）
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 2: brands_public ビュー作成
-- ============================================================
-- 除外列: merchant_id, memo, pii_access_settings,
--         escalation_email, escalation_slack_webhook,
--         contact_name, contact_email
-- brands には status / is_paused カラムなし、WHERE フィルタなし

CREATE OR REPLACE VIEW public.brands_public AS
SELECT
  id,
  display_id,
  slug,
  name,
  brand_description,
  hero_catchphrase,
  logo_url,
  logo_mark_type,
  logo_mark_emoji,
  logo_mark_src,
  logo_text_type,
  logo_text_value,
  font_family,
  font_families,
  font_color,
  primary_color,
  primary_dark,
  primary_light,
  secondary_color,
  header_bg,
  header_text_color,
  sns_line,
  sns_x,
  sns_instagram,
  sns_facebook,
  sns_tiktok,
  sns_youtube,
  sns_threads,
  social_links,
  company_url,
  recruit_url,
  custom_domain,
  hp_published,
  hp_settings,
  design_settings,
  service_settings,
  cancel_no_show,
  cancel_same_day,
  cancel_3days,
  cancel_policy,
  created_at
FROM public.brands;

COMMENT ON VIEW public.brands_public IS
  'P0 セキュリティ対策(2026-04-18): anon 向け公開 OK 列のみ。除外=merchant_id/memo/pii_access_settings/escalation_*/contact_*。';

-- STEP 2a: anon / authenticated に SELECT 権限付与
GRANT SELECT ON public.brands_public TO anon, authenticated;


-- ============================================================
-- STEP 2b: brands 元テーブルから anon SELECT を完全除去
-- ============================================================

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'brands'
      AND (
        'anon' = ANY(roles)
        OR 'public' = ANY(roles)
      )
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.brands', pol.policyname);
    RAISE NOTICE 'Dropped policy % on brands', pol.policyname;
  END LOOP;
END $$;

REVOKE SELECT ON public.brands FROM anon;
REVOKE SELECT ON public.brands FROM PUBLIC;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 3: 検証用 SELECT（migration 後に実行）
-- ============================================================

-- 3-1. 新ビューのカラム数確認
-- 期待値: venues_public = 48 カラム（元 venues 58 - 除外 10）、
--         brands_public = 41 カラム（元 brands 48 - 除外 7）
SELECT 'venues_public columns' AS item, COUNT(*)::text AS value
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'venues_public'
UNION ALL
SELECT 'brands_public columns', COUNT(*)::text
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'brands_public';

-- 3-2. 新ビューの件数（service_role 実行）
-- 期待: STEP 0-5 の「active & not-paused rows」と一致
SELECT 'venues_public rows' AS item, COUNT(*)::text AS value FROM public.venues_public
UNION ALL
SELECT 'brands_public rows', COUNT(*)::text FROM public.brands_public;

-- 3-3. 削除された anon policy 確認
-- 期待: venues / brands に anon role を含むポリシーが残っていないこと（0 件）
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('venues', 'brands')
  AND (
    'anon' = ANY(roles) OR 'public' = ANY(roles)
  )
  AND cmd IN ('SELECT', 'ALL');

-- 3-4. anon の GRANT が剥奪されていることを確認
-- 期待: venues / brands への anon SELECT が 0 件
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('venues', 'brands')
  AND grantee = 'anon'
  AND privilege_type = 'SELECT';

-- 3-5. anon role で実際にアクセス試行（Tasei が SQL Editor で実行）
-- WHY: anon の実挙動を確認するため SET ROLE で一時的に切り替える
-- 実行手順:
--   BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT COUNT(*) FROM public.venues;        -- 期待: permission denied or 0 rows
--   SELECT COUNT(*) FROM public.venues_public; -- 期待: 取得成功
--   SELECT COUNT(*) FROM public.brands;        -- 期待: permission denied or 0 rows
--   SELECT COUNT(*) FROM public.brands_public; -- 期待: 取得成功
--   ROLLBACK;


-- ============================================================
-- ROLLBACK（問題発生時に SQL Editor で実行）
-- ============================================================
-- 以下のコメントを外して実行する。STEP 0-1 の元ポリシー一覧を
-- 事前に記録しておき、必要なら手動で再作成すること。
/*

-- 1. 新ビュー削除
DROP VIEW IF EXISTS public.venues_public CASCADE;
DROP VIEW IF EXISTS public.brands_public CASCADE;

-- 2. anon SELECT 権限の復元
-- NOTE: 元々は PUBLIC に default GRANT があった可能性が高い
GRANT SELECT ON public.venues TO anon;
GRANT SELECT ON public.brands TO anon;

-- 3. RLS ポリシーの復元
-- STEP 0-1 の結果を参照し、必要に応じて手動で CREATE POLICY を実行
-- 例:
-- CREATE POLICY "venues_select_anon_legacy" ON public.venues
--   FOR SELECT TO anon USING (true);

-- 4. 確認
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('venues', 'brands')
  AND grantee = 'anon';

*/
