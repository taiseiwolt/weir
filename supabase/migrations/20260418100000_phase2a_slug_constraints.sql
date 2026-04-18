-- Migration: Phase 2-a brands.slug / venues.slug 制約追加
-- Date: 2026-04-18
-- Context: Phase 2-a URL 構造刷新（/{brand_slug}/{venue_slug} 形式）
--
-- 目的:
--   ブランド/ベニューの slug が URL セグメントとして使われるため、
--   (a) UNIQUE: 既存の部分 UNIQUE INDEX を正式な UNIQUE 制約に昇格（brands）
--       + 新規 UNIQUE 制約追加（venues、現状 UNIQUE なし）
--   (b) CHECK: 形式（英小文字・数字・ハイフン、3-50 文字）
--       + 予約語除外（routing で衝突する語 + 業務ドメイン語）
--   (c) プレフィックス除外（weir-, aiden-, test- 等は内部用）
--
-- ⚠️ 手動実行前提:
--   このファイルは supabase db push で自動実行してもよいが、
--   Taisei がローカルで一度に流すなら Supabase SQL Editor にそのまま貼り付け可。
--   STEP 1 を先に実行し、違反があれば STEP 2 を読んで対処してから STEP 3 を実行すること。
--
-- ロールバック:
--   ALTER TABLE brands DROP CONSTRAINT brands_slug_unique;
--   ALTER TABLE brands DROP CONSTRAINT brands_slug_format;
--   ALTER TABLE venues DROP CONSTRAINT venues_slug_unique;
--   ALTER TABLE venues DROP CONSTRAINT venues_slug_format;
--   (UNIQUE INDEX を旧来の partial に戻したい場合は再作成)

-- =====================================================================
-- STEP 0: 前提確認（カラム存在・型チェック）
-- =====================================================================
-- 実行: 期待結果 = brands / venues それぞれに slug text カラムあり
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('brands', 'venues')
  AND column_name = 'slug'
ORDER BY table_name;
-- 期待結果:
--   brands | slug | text | YES
--   venues | slug | text | YES


-- =====================================================================
-- STEP 1: brands.slug 既存データ検証
-- =====================================================================
-- 違反行があれば、STEP 2 を読み、データを修正してから STEP 3 を実行すること。
-- 0 行なら全 brands が制約を満たす。
SELECT
  id,
  slug,
  name,
  CASE
    WHEN slug IS NULL THEN 'NULL (UNIQUE 追加は可だが、Phase 2-a では全ブランドに slug 必須)'
    WHEN slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN '形式違反（英小文字・数字・ハイフン以外が含まれる、または先頭/末尾ハイフン）'
    WHEN length(slug) < 3 OR length(slug) > 50 THEN '長さ違反（3-50 文字）'
    WHEN slug IN (
      'api', 'legal', 'public', 'docs',
      'admin', 'customer',
      'menu', 'stores', 'membership', 'news', 'sitemap',
      'privacy', 'terms', 'tokushoho',
      'order', 'mypage', 'tracking', 'checkout',
      'verify-email', 'reset-password', 'guest-order',
      'brand', 'store', 'venue', 'merchant',
      'index', 'home', 'about', 'contact',
      '404', 'static'
    ) THEN '予約語違反'
    WHEN slug LIKE 'weir-%' THEN 'weir- プレフィックス違反'
    WHEN slug LIKE 'aiden-%' THEN 'aiden- プレフィックス違反'
    WHEN slug LIKE 'test-%' THEN 'test- プレフィックス違反'
    WHEN slug LIKE 'e2e-%' THEN 'e2e- プレフィックス違反'
    WHEN slug LIKE 'playwright-%' THEN 'playwright- プレフィックス違反'
    WHEN slug LIKE 'seed-%' THEN 'seed- プレフィックス違反'
    WHEN slug LIKE 'qa-%' THEN 'qa- プレフィックス違反'
    ELSE NULL
  END AS violation_reason
FROM brands
WHERE
  slug IS NULL
  OR slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  OR length(slug) < 3 OR length(slug) > 50
  OR slug IN (
    'api', 'legal', 'public', 'docs',
    'admin', 'customer',
    'menu', 'stores', 'membership', 'news', 'sitemap',
    'privacy', 'terms', 'tokushoho',
    'order', 'mypage', 'tracking', 'checkout',
    'verify-email', 'reset-password', 'guest-order',
    'brand', 'store', 'venue', 'merchant',
    'index', 'home', 'about', 'contact',
    '404', 'static'
  )
  OR slug LIKE 'weir-%'
  OR slug LIKE 'aiden-%'
  OR slug LIKE 'test-%'
  OR slug LIKE 'e2e-%'
  OR slug LIKE 'playwright-%'
  OR slug LIKE 'seed-%'
  OR slug LIKE 'qa-%';


-- =====================================================================
-- STEP 1b: venues.slug 既存データ検証
-- =====================================================================
SELECT
  id,
  slug,
  name,
  display_id,
  CASE
    WHEN slug IS NULL THEN 'NULL（backfill 要）'
    WHEN slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN '形式違反'
    WHEN length(slug) < 3 OR length(slug) > 50 THEN '長さ違反'
    WHEN slug IN (
      'api', 'legal', 'public', 'docs',
      'admin', 'customer',
      'menu', 'stores', 'membership', 'news', 'sitemap',
      'privacy', 'terms', 'tokushoho',
      'order', 'mypage', 'tracking', 'checkout',
      'verify-email', 'reset-password', 'guest-order',
      'brand', 'store', 'venue', 'merchant',
      'index', 'home', 'about', 'contact',
      '404', 'static'
    ) THEN '予約語違反'
    WHEN slug LIKE 'weir-%' THEN 'weir- プレフィックス違反'
    WHEN slug LIKE 'aiden-%' THEN 'aiden- プレフィックス違反'
    WHEN slug LIKE 'test-%' THEN 'test- プレフィックス違反'
    ELSE NULL
  END AS violation_reason
FROM venues
WHERE
  slug IS NULL
  OR slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  OR length(slug) < 3 OR length(slug) > 50
  OR slug IN (
    'api', 'legal', 'public', 'docs',
    'admin', 'customer',
    'menu', 'stores', 'membership', 'news', 'sitemap',
    'privacy', 'terms', 'tokushoho',
    'order', 'mypage', 'tracking', 'checkout',
    'verify-email', 'reset-password', 'guest-order',
    'brand', 'store', 'venue', 'merchant',
    'index', 'home', 'about', 'contact',
    '404', 'static'
  )
  OR slug LIKE 'weir-%'
  OR slug LIKE 'aiden-%'
  OR slug LIKE 'test-%'
  OR slug LIKE 'e2e-%'
  OR slug LIKE 'playwright-%'
  OR slug LIKE 'seed-%'
  OR slug LIKE 'qa-%';


-- =====================================================================
-- STEP 1c: venues.slug 既存衝突チェック（同一 slug で複数 venue）
-- =====================================================================
-- UNIQUE 制約を張る前に衝突がないことを確認
SELECT slug, COUNT(*) AS venue_count
FROM venues
WHERE slug IS NOT NULL
GROUP BY slug
HAVING COUNT(*) > 1;
-- 期待結果: 0 rows
-- （複数ブランド横断で同じ venue slug が存在しても、本 UNIQUE は グローバル UNIQUE。
--   ブランド単位 UNIQUE にしたい場合は後述の UNIQUE (brand_id, slug) に変更すること。
--   Phase 2-a では venue_slug の display_id 起源（STR-XXXXXXX）で衝突確率ほぼ 0 なのでグローバル UNIQUE で十分。）


-- =====================================================================
-- STEP 2: 違反があった場合の対処方針（READ ONLY、実行しない）
-- =====================================================================
-- ケース 1: NULL slug（brands）
--   → display_id（brand display_id）または name から slug を生成し UPDATE
--     例: UPDATE brands SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g')) WHERE slug IS NULL;
-- ケース 2: 形式違反（大文字、アンダースコア、特殊文字）
--   → 小文字化 + 記号除去。例:
--     UPDATE brands SET slug = lower(regexp_replace(slug, '[^a-z0-9-]+', '-', 'g')) WHERE id = '<id>';
-- ケース 3: 予約語違反（例 slug='order'）
--   → 業務決定で代替 slug に更新（Taisei 判断）
-- ケース 4: プレフィックス違反（例 slug='weir-sushi'）
--   → 業務決定で代替 slug に更新（Taisei 判断）
-- ケース 5: 長さ違反
--   → 3-50 文字に収まる代替 slug に更新
-- ケース 6: venues.slug NULL
--   → 20260417100000 で backfill 済み。新規 venue は display_id 起源で自動設定されるはず。


-- =====================================================================
-- STEP 3: brands.slug 制約追加（前提: STEP 1 の違反が 0 件）
-- =====================================================================

-- 3a: 既存の partial UNIQUE INDEX を削除（正式な UNIQUE CONSTRAINT に置換するため）
--     (既存: 20260405100000_phase2_brand_extensions.sql の
--      `CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_unique ON brands (slug) WHERE slug IS NOT NULL`)
DROP INDEX IF EXISTS brands_slug_unique;

-- 3b: UNIQUE 制約追加（NULL は許容、複数 NULL 可。CHECK で非 NULL を別途強制）
ALTER TABLE brands
  ADD CONSTRAINT brands_slug_unique UNIQUE (slug);

-- 3c: CHECK 制約追加（形式・予約語・プレフィックス）
--     NULL は CHECK が UNKNOWN → 通過するので、NOT NULL にしたい場合は別 ALTER で。
ALTER TABLE brands
  ADD CONSTRAINT brands_slug_format CHECK (
    slug IS NULL
    OR (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND length(slug) BETWEEN 3 AND 50
      AND slug NOT IN (
        'api', 'legal', 'public', 'docs',
        'admin', 'customer',
        'menu', 'stores', 'membership', 'news', 'sitemap',
        'privacy', 'terms', 'tokushoho',
        'order', 'mypage', 'tracking', 'checkout',
        'verify-email', 'reset-password', 'guest-order',
        'brand', 'store', 'venue', 'merchant',
        'index', 'home', 'about', 'contact',
        '404', 'static'
      )
      AND slug NOT LIKE 'weir-%'
      AND slug NOT LIKE 'aiden-%'
      AND slug NOT LIKE 'test-%'
      AND slug NOT LIKE 'e2e-%'
      AND slug NOT LIKE 'playwright-%'
      AND slug NOT LIKE 'seed-%'
      AND slug NOT LIKE 'qa-%'
    )
  );


-- =====================================================================
-- STEP 4: venues.slug 制約追加（前提: STEP 1b / 1c の違反が 0 件）
-- =====================================================================

-- 4a: UNIQUE 制約追加（現状なし）
--     注: brand_id ごとの複合 UNIQUE ではなくグローバル UNIQUE。
--     STR-XXXXXXX 起源で衝突確率が実質 0 のため。
ALTER TABLE venues
  ADD CONSTRAINT venues_slug_unique UNIQUE (slug);

-- 4b: CHECK 制約追加
ALTER TABLE venues
  ADD CONSTRAINT venues_slug_format CHECK (
    slug IS NULL
    OR (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND length(slug) BETWEEN 3 AND 50
      AND slug NOT IN (
        'api', 'legal', 'public', 'docs',
        'admin', 'customer',
        'menu', 'stores', 'membership', 'news', 'sitemap',
        'privacy', 'terms', 'tokushoho',
        'order', 'mypage', 'tracking', 'checkout',
        'verify-email', 'reset-password', 'guest-order',
        'brand', 'store', 'venue', 'merchant',
        'index', 'home', 'about', 'contact',
        '404', 'static'
      )
      AND slug NOT LIKE 'weir-%'
      AND slug NOT LIKE 'aiden-%'
      AND slug NOT LIKE 'test-%'
      AND slug NOT LIKE 'e2e-%'
      AND slug NOT LIKE 'playwright-%'
      AND slug NOT LIKE 'seed-%'
      AND slug NOT LIKE 'qa-%'
    )
  );


-- =====================================================================
-- STEP 5: 制約追加後の確認
-- =====================================================================
-- 制約が期待通り作られたか確認
SELECT
  table_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name IN ('brands', 'venues')
  AND constraint_name LIKE '%slug%'
ORDER BY table_name, constraint_name;
-- 期待結果:
--   brands | brands_slug_format | CHECK
--   brands | brands_slug_unique | UNIQUE
--   venues | venues_slug_format | CHECK
--   venues | venues_slug_unique | UNIQUE
