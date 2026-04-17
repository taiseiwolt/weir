-- Migration: venues.slug backfill from display_id
-- Date: 2026-04-17
-- Context: Phase 1 (ブランド/店舗MO 止血・機能復旧)
--
-- 背景:
--   venues.slug が NULL だと weir-brand-stores.html → weir-store.html 遷移で
--   URL パラメータが空になり店舗詳細ページが機能しない。また管理マスタの
--   「🛒 モバイルオーダーを開く」リンク (weir-admin.html:3079) も非表示になる。
--   venues.display_id (例: STR-ra6DXDh) から先頭 "STR-" を削除した値を
--   slug として一括設定する。
--
-- 事前確認 (2026-04-17 anon REST API で取得):
--   - venues 総数               : 1
--   - venues.slug IS NULL       : 1 件（居酒屋 潮 中目黒店, display_id=STR-ra6DXDh）
--   - substring(display_id FROM 5) の衝突: なし
--   - venues.slug の UNIQUE 制約 : なし (brands.slug のみ unique)
--
-- ロールバック:
--   UPDATE venues SET slug = NULL WHERE display_id = 'STR-ra6DXDh';

-- [STEP 1] 実行前確認 (影響範囲チェック)
SELECT COUNT(*) AS target_count
FROM venues
WHERE slug IS NULL AND display_id LIKE 'STR-%';

-- [STEP 2] 本処理 (slug backfill)
UPDATE venues
SET slug = substring(display_id FROM 5),
    updated_at = NOW()
WHERE slug IS NULL AND display_id LIKE 'STR-%';

-- [STEP 3] 実行後確認 (全 venue で slug != NULL を期待)
SELECT display_id, slug, name
FROM venues
WHERE slug IS NULL;
-- 期待結果: 0 rows
