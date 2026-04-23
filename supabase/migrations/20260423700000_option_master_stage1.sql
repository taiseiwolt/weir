-- =============================================================================
-- CC-Option-Master-Stage1 Migration: オプションマスタ案 β の 4 テーブル新設
--
-- 決定: D-242 (2026-04-23, β 採用確定)
-- 関連: D-244 (25 商品 Excel, サイズ廃止) / D-233 (products スキーマ fix 完遂)
-- 依頼: cc-requests/cc-option-master-stage1 (CC-Option-Master-Stage1)
--
-- Creates:
--   1. option_groups            — グループマスタ（brand 単位）
--   2. options                  — 選択肢マスタ（group 単位 + price_delta）
--   3. product_option_groups    — 商品 ↔ グループ中間（is_required 上書き対応）
--   4. option_sale_status       — venue 単位品切れ管理（D-61 準拠）
--
-- RLS: products を踏襲（anon SELECT / authenticated: staff_accounts brand_id 経由 / service_role ALL）
-- Triggers: update_updated_at_column() を再利用（20260408200000 で定義済み）
--
-- Scope: 本 migration は DB 基盤のみ。UI / bulk-import / Stripe / 品切れ UI は別 CC。
-- =============================================================================

BEGIN;

-- =============================================================================
-- Table 1: option_groups — オプショングループマスタ（brand 単位）
-- =============================================================================

CREATE TABLE option_groups (
  group_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      TEXT UNIQUE NOT NULL DEFAULT 'GRP-' || substr(md5(random()::text), 1, 7),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  selection_type  TEXT NOT NULL CHECK (selection_type IN ('single', 'multiple')),
  is_required     BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE INDEX idx_option_groups_brand ON option_groups(brand_id);

COMMENT ON TABLE option_groups IS
  'Option group master (brand-scoped). D-242 β adoption. Example: "味付け" (single-select required) / "トッピング" (multiple optional).';
COMMENT ON COLUMN option_groups.selection_type IS
  'single = ラジオ選択（1 つのみ）/ multiple = チェックボックス（複数可）';
COMMENT ON COLUMN option_groups.is_required IS
  'true の場合、顧客はこのグループから最低 1 つ選択が必須（single なら必ず 1 つ、multiple なら 1 つ以上）';

-- =============================================================================
-- Table 2: options — 選択肢マスタ（option_groups 配下）
-- =============================================================================
-- price_delta: products.price と同じ int 型（2026-04-23 確認済み）
-- 負値を許容することで「小サイズ -100 円」等の減算も可能

CREATE TABLE options (
  option_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      TEXT UNIQUE NOT NULL DEFAULT 'OPT-' || substr(md5(random()::text), 1, 7),
  group_id        UUID NOT NULL REFERENCES option_groups(group_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  price_delta     INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);

CREATE INDEX idx_options_group ON options(group_id);

COMMENT ON TABLE options IS
  'Option value master (group-scoped). D-242 β adoption. Example: "タレ" / "塩" / "おろしポン酢" under "味付け" group.';
COMMENT ON COLUMN options.price_delta IS
  '追加料金の差分（int 円）。負値も可（例: 小サイズ -100 円）。注文時は商品価格 + Σ(price_delta) で最終金額算出';
COMMENT ON COLUMN options.is_default IS
  'true の場合、注文 UI でデフォルト選択状態（顧客が操作しなくても自動選択済）';

-- =============================================================================
-- Table 3: product_option_groups — 商品 ↔ グループ中間テーブル
-- =============================================================================
-- is_required NULLABLE: NULL = グループのデフォルト（option_groups.is_required）を使用
-- 商品ごとに上書きしたい場合（例: 通常商品は味付け必須だが「おまかせ」商品は任意）のみ true/false を設定

CREATE TABLE product_option_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES option_groups(group_id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_required     BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, group_id)
);

CREATE INDEX idx_pog_product ON product_option_groups(product_id);
CREATE INDEX idx_pog_group ON product_option_groups(group_id);

COMMENT ON TABLE product_option_groups IS
  'Many-to-many: products ↔ option_groups. D-242 β adoption. is_required NULL = use option_groups.is_required default.';
COMMENT ON COLUMN product_option_groups.is_required IS
  'NULL = option_groups.is_required のデフォルト採用、true/false = 商品ごと上書き';

-- =============================================================================
-- Table 4: option_sale_status — venue 単位品切れ管理（D-61 準拠）
-- =============================================================================
-- D-61: 商品の品切れ管理を店舗単位で扱うパターン。options にも適用。
-- status: available (通常) / sold_out_today (本日のみ売り切れ) / discontinued (永久販売終了)
-- UNIQUE (venue_id, option_id): 1 店舗 × 1 選択肢 の現状状態を保持

CREATE TABLE option_sale_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  option_id       UUID NOT NULL REFERENCES options(option_id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('available', 'sold_out_today', 'discontinued')),
  updated_by      TEXT NOT NULL CHECK (updated_by IN ('store', 'admin', 'merchant')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  UNIQUE (venue_id, option_id)
);

CREATE INDEX idx_option_sale_status_venue ON option_sale_status(venue_id);
CREATE INDEX idx_option_sale_status_venue_status ON option_sale_status(venue_id, status);

COMMENT ON TABLE option_sale_status IS
  'Per-venue sale status for options (D-61 pattern applied to options). Stage 2 で UI 実装予定（本 Stage 1 はテーブルのみ）。';
COMMENT ON COLUMN option_sale_status.updated_by IS
  'store = 店舗スタッフ（POS or 管理画面）/ admin = Weir 本部 / merchant = 加盟店オーナー';

-- =============================================================================
-- updated_at Triggers
-- =============================================================================
-- update_updated_at_column() は 20260408200000_template_catalog.sql で定義済み。
-- product_option_groups は updated_at カラムを持たない（中間テーブルのため）ので trigger 不要。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_option_groups_updated_at') THEN
    CREATE TRIGGER set_option_groups_updated_at
      BEFORE UPDATE ON option_groups
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_options_updated_at') THEN
    CREATE TRIGGER set_options_updated_at
      BEFORE UPDATE ON options
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_option_sale_status_updated_at') THEN
    CREATE TRIGGER set_option_sale_status_updated_at
      BEFORE UPDATE ON option_sale_status
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- RLS: option_groups (products パターン踏襲)
-- =============================================================================
-- products の RLS (20260408400000_security_p1_rls_fixes.sql L128-156) を完全踏襲:
--   - service_role: 全操作 (USING true WITH CHECK true)
--   - anon: SELECT のみ (USING true) — 注文 UI でオプション選択のため必要
--   - authenticated SELECT: USING true (全件可視、既存 products と同じ)
--   - authenticated INSERT/UPDATE/DELETE: staff_accounts.brand_id 経由

ALTER TABLE option_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "option_groups_service_role" ON option_groups FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "option_groups_anon_select" ON option_groups FOR SELECT TO anon
  USING (true);

CREATE POLICY "option_groups_auth_select" ON option_groups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "option_groups_auth_insert" ON option_groups FOR INSERT TO authenticated
  WITH CHECK (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

CREATE POLICY "option_groups_auth_update" ON option_groups FOR UPDATE TO authenticated
  USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

CREATE POLICY "option_groups_auth_delete" ON option_groups FOR DELETE TO authenticated
  USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

-- =============================================================================
-- RLS: options (group_id → option_groups.brand_id 経由)
-- =============================================================================

ALTER TABLE options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "options_service_role" ON options FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "options_anon_select" ON options FOR SELECT TO anon
  USING (true);

CREATE POLICY "options_auth_select" ON options FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "options_auth_insert" ON options FOR INSERT TO authenticated
  WITH CHECK (group_id IN (
    SELECT og.group_id FROM option_groups og
    WHERE og.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

CREATE POLICY "options_auth_update" ON options FOR UPDATE TO authenticated
  USING (group_id IN (
    SELECT og.group_id FROM option_groups og
    WHERE og.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

CREATE POLICY "options_auth_delete" ON options FOR DELETE TO authenticated
  USING (group_id IN (
    SELECT og.group_id FROM option_groups og
    WHERE og.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

-- =============================================================================
-- RLS: product_option_groups (product_id → products.brand_id 経由)
-- =============================================================================

ALTER TABLE product_option_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_option_groups_service_role" ON product_option_groups FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "product_option_groups_anon_select" ON product_option_groups FOR SELECT TO anon
  USING (true);

CREATE POLICY "product_option_groups_auth_select" ON product_option_groups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "product_option_groups_auth_insert" ON product_option_groups FOR INSERT TO authenticated
  WITH CHECK (product_id IN (
    SELECT p.id FROM products p
    WHERE p.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

CREATE POLICY "product_option_groups_auth_update" ON product_option_groups FOR UPDATE TO authenticated
  USING (product_id IN (
    SELECT p.id FROM products p
    WHERE p.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

CREATE POLICY "product_option_groups_auth_delete" ON product_option_groups FOR DELETE TO authenticated
  USING (product_id IN (
    SELECT p.id FROM products p
    WHERE p.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

-- =============================================================================
-- RLS: option_sale_status (venue_id → venues.brand_id 経由)
-- =============================================================================

ALTER TABLE option_sale_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "option_sale_status_service_role" ON option_sale_status FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "option_sale_status_anon_select" ON option_sale_status FOR SELECT TO anon
  USING (true);

CREATE POLICY "option_sale_status_auth_select" ON option_sale_status FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "option_sale_status_auth_insert" ON option_sale_status FOR INSERT TO authenticated
  WITH CHECK (venue_id IN (
    SELECT v.id FROM venues v
    WHERE v.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

CREATE POLICY "option_sale_status_auth_update" ON option_sale_status FOR UPDATE TO authenticated
  USING (venue_id IN (
    SELECT v.id FROM venues v
    WHERE v.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

CREATE POLICY "option_sale_status_auth_delete" ON option_sale_status FOR DELETE TO authenticated
  USING (venue_id IN (
    SELECT v.id FROM venues v
    WHERE v.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  ));

COMMIT;

-- =============================================================================
-- ROLLBACK SQL (本番で障害時は以下を Dashboard SQL Editor に貼り付け実行)
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS set_option_sale_status_updated_at ON option_sale_status;
--   DROP TRIGGER IF EXISTS set_options_updated_at ON options;
--   DROP TRIGGER IF EXISTS set_option_groups_updated_at ON option_groups;
--   DROP TABLE IF EXISTS option_sale_status;
--   DROP TABLE IF EXISTS product_option_groups;
--   DROP TABLE IF EXISTS options;
--   DROP TABLE IF EXISTS option_groups;
-- COMMIT;
