-- =============================================================
-- セキュリティP1修正: RLSポリシー一括修正
-- チームCレビュー 2026-04-08 準拠
-- =============================================================

-- ─────────────────────────────────────────────────
-- A-1: メンバーシップ4テーブル — ロール制限追加 (02-P1-1)
-- point_settings, rank_settings, review_point_settings, review_tokens
-- 現在: USING(true) ロール制限なし → service_role全操作、authenticated自ブランドSELECT
-- ─────────────────────────────────────────────────

-- point_settings
DROP POLICY IF EXISTS "ps_select_all" ON point_settings;
DROP POLICY IF EXISTS "ps_insert_all" ON point_settings;
DROP POLICY IF EXISTS "ps_update_all" ON point_settings;
CREATE POLICY "ps_service_role" ON point_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ps_auth_select" ON point_settings FOR SELECT TO authenticated USING (
  brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  OR brand_id IN (SELECT m.brand_id FROM members m WHERE m.auth_user_id = auth.uid())
);

-- rank_settings
DROP POLICY IF EXISTS "rs_select_all" ON rank_settings;
DROP POLICY IF EXISTS "rs_insert_all" ON rank_settings;
DROP POLICY IF EXISTS "rs_update_all" ON rank_settings;
DROP POLICY IF EXISTS "rs_delete_all" ON rank_settings;
CREATE POLICY "rs_service_role" ON rank_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "rs_auth_select" ON rank_settings FOR SELECT TO authenticated USING (
  brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  OR brand_id IN (SELECT m.brand_id FROM members m WHERE m.auth_user_id = auth.uid())
);

-- review_point_settings
DROP POLICY IF EXISTS "rps_select_all" ON review_point_settings;
DROP POLICY IF EXISTS "rps_insert_all" ON review_point_settings;
DROP POLICY IF EXISTS "rps_update_all" ON review_point_settings;
CREATE POLICY "rps_service_role" ON review_point_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "rps_auth_select" ON review_point_settings FOR SELECT TO authenticated USING (
  brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  OR brand_id IN (SELECT m.brand_id FROM members m WHERE m.auth_user_id = auth.uid())
);

-- review_tokens
DROP POLICY IF EXISTS "rt_select_all" ON review_tokens;
DROP POLICY IF EXISTS "rt_insert_all" ON review_tokens;
DROP POLICY IF EXISTS "rt_update_all" ON review_tokens;
CREATE POLICY "rt_service_role" ON review_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "rt_auth_select" ON review_tokens FOR SELECT TO authenticated USING (
  member_id IN (SELECT m.id FROM members m WHERE m.auth_user_id = auth.uid())
);
CREATE POLICY "rt_auth_update" ON review_tokens FOR UPDATE TO authenticated USING (
  member_id IN (SELECT m.id FROM members m WHERE m.auth_user_id = auth.uid())
);

-- ─────────────────────────────────────────────────
-- A-2: 5テーブルの認証済みユーザー無制限書込み修正 (02-P1-2)
-- brand_contents, crm_templates, sns_account_settings, staff_store_assignments, brand_templates
-- 現在: FOR ALL TO authenticated USING(true) → brand_idスコープに変更
-- ─────────────────────────────────────────────────

-- brand_contents: brand_idスコープ
DROP POLICY IF EXISTS "brand_contents_auth_write" ON brand_contents;
CREATE POLICY "brand_contents_auth_write" ON brand_contents FOR ALL TO authenticated
  USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()))
  WITH CHECK (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

-- crm_templates: brand_idスコープ
DROP POLICY IF EXISTS "crm_templates_auth_write" ON crm_templates;
CREATE POLICY "crm_templates_auth_write" ON crm_templates FOR ALL TO authenticated
  USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()))
  WITH CHECK (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

-- sns_account_settings: brand_idスコープ
DROP POLICY IF EXISTS "sns_settings_auth_write" ON sns_account_settings;
CREATE POLICY "sns_settings_auth_write" ON sns_account_settings FOR ALL TO authenticated
  USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()))
  WITH CHECK (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

-- staff_store_assignments: 自分のスタッフレコードのみ + admin全操作
DROP POLICY IF EXISTS "staff_store_auth_write" ON staff_store_assignments;
CREATE POLICY "staff_store_auth_write" ON staff_store_assignments FOR ALL TO authenticated
  USING (
    staff_id IN (SELECT sa.id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid() AND sa.role IN ('platform_admin', 'corp_admin', 'owner'))
  )
  WITH CHECK (
    staff_id IN (SELECT sa.id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid() AND sa.role IN ('platform_admin', 'corp_admin', 'owner'))
  );

-- brand_templates: brand_idスコープ
DROP POLICY IF EXISTS "brand_templates_auth_write" ON brand_templates;
CREATE POLICY "brand_templates_auth_write" ON brand_templates FOR ALL TO authenticated
  USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()))
  WITH CHECK (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));

-- ─────────────────────────────────────────────────
-- A-3: SECURITY DEFINER関数のREVOKE (02-P1-3)
-- 7関数からPUBLICアクセスを削除し、service_roleのみに制限
-- ─────────────────────────────────────────────────

DO $$
DECLARE
  func_name TEXT;
BEGIN
  FOREACH func_name IN ARRAY ARRAY[
    'check_ai_usage_limit',
    'anonymize_chat_for_withdrawn_member',
    'notify_new_reservation',
    'update_member_order_stats',
    'deduct_points',
    'grant_compensation_points',
    'check_and_upgrade_rank'
  ] LOOP
    -- 関数が存在する場合のみ実行
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = func_name) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I FROM PUBLIC', func_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I TO service_role', func_name);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────
-- A-4: products, product_sizes, staff_accounts のRLS有効化 (02-P1-5)
-- ─────────────────────────────────────────────────

-- products: RLS有効化 + ポリシー
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- service_role全操作
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_service_role') THEN
    CREATE POLICY "products_service_role" ON products FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
-- anon: SELECTのみ（メニュー表示用）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_anon_select') THEN
    CREATE POLICY "products_anon_select" ON products FOR SELECT TO anon USING (true);
  END IF;
END $$;
-- authenticated: SELECTは全件（メニュー表示）、INSERT/UPDATE/DELETEは自ブランドのみ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_auth_select') THEN
    CREATE POLICY "products_auth_select" ON products FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_auth_write') THEN
    CREATE POLICY "products_auth_write" ON products FOR INSERT TO authenticated
      WITH CHECK (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));
    CREATE POLICY "products_auth_update" ON products FOR UPDATE TO authenticated
      USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));
    CREATE POLICY "products_auth_delete" ON products FOR DELETE TO authenticated
      USING (brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()));
  END IF;
END $$;

-- product_sizes: RLS有効化 + ポリシー
ALTER TABLE product_sizes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_sizes' AND policyname = 'product_sizes_service_role') THEN
    CREATE POLICY "product_sizes_service_role" ON product_sizes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_sizes' AND policyname = 'product_sizes_anon_select') THEN
    CREATE POLICY "product_sizes_anon_select" ON product_sizes FOR SELECT TO anon USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_sizes' AND policyname = 'product_sizes_auth_select') THEN
    CREATE POLICY "product_sizes_auth_select" ON product_sizes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_sizes' AND policyname = 'product_sizes_auth_write') THEN
    CREATE POLICY "product_sizes_auth_write" ON product_sizes FOR INSERT TO authenticated
      WITH CHECK (product_id IN (SELECT p.id FROM products p WHERE p.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())));
    CREATE POLICY "product_sizes_auth_update" ON product_sizes FOR UPDATE TO authenticated
      USING (product_id IN (SELECT p.id FROM products p WHERE p.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())));
    CREATE POLICY "product_sizes_auth_delete" ON product_sizes FOR DELETE TO authenticated
      USING (product_id IN (SELECT p.id FROM products p WHERE p.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())));
  END IF;
END $$;

-- staff_accounts: RLS有効化 + ポリシー
ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_accounts' AND policyname = 'staff_accounts_service_role') THEN
    CREATE POLICY "staff_accounts_service_role" ON staff_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_accounts' AND policyname = 'staff_accounts_auth_select') THEN
    CREATE POLICY "staff_accounts_auth_select" ON staff_accounts FOR SELECT TO authenticated
      USING (auth_user_id = auth.uid());
  END IF;
END $$;

-- ─────────────────────────────────────────────────
-- A-5: payments, refunds のRLS有効化 (02-P1-6)
-- ─────────────────────────────────────────────────

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- payments/refundsのservice_roleポリシー（既存ポリシーが動作するようにENABLEを追加）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'payments_service_role') THEN
    CREATE POLICY "payments_service_role" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'refunds' AND policyname = 'refunds_service_role') THEN
    CREATE POLICY "refunds_service_role" ON refunds FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
