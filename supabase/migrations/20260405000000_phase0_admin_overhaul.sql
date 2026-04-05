-- ============================================================
-- Phase 0: Admin Overhaul — 全テーブル定義 + products.menu_pattern_id 追加
-- 2026-04-05
-- ============================================================
--
-- このファイルは AIden プラットフォームの全テーブル定義を1ファイルにまとめた
-- リファレンス兼マイグレーションである。
-- 既存テーブルは CREATE TABLE IF NOT EXISTS で冪等に定義し、
-- 新規カラム追加のみ実際のスキーマ変更として実行される。
--
-- ============================================================

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 共通関数: updated_at 自動更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ############################################################
-- カテゴリ 1: 組織階層（Corporation → Brand → Store）
-- ############################################################

-- ------------------------------------------------------------
-- 1-1. corporations（法人）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corporations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  representative    TEXT,
  status            TEXT DEFAULT 'active',
  website_url       TEXT,
  recruit_url       TEXT,
  rep_email         TEXT,
  stripe_account_id TEXT,
  display_id        TEXT UNIQUE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE corporations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='corporations' AND policyname='corporations_select_authenticated') THEN
    CREATE POLICY "corporations_select_authenticated" ON corporations FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='corporations' AND policyname='corporations_all_service_role') THEN
    CREATE POLICY "corporations_all_service_role" ON corporations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_corporations_display_id ON corporations (display_id);

-- ------------------------------------------------------------
-- 1-2. brands（ブランド）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corp_id       UUID REFERENCES corporations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE,
  description   TEXT,
  logo_url      TEXT,
  hero_image_url TEXT,
  theme_color   TEXT,
  custom_domain TEXT,
  display_id    TEXT UNIQUE NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brands' AND policyname='brands_select_authenticated') THEN
    CREATE POLICY "brands_select_authenticated" ON brands FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS brands_custom_domain_unique ON brands (custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brands_display_id ON brands (display_id);

-- ------------------------------------------------------------
-- 1-3. stores（店舗）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  address                       TEXT,
  phone                         TEXT,
  latitude                      NUMERIC,
  longitude                     NUMERIC,
  image_url                     TEXT,
  is_active                     BOOLEAN DEFAULT true,
  is_paused                     BOOLEAN DEFAULT false,
  display_id                    TEXT UNIQUE NOT NULL,
  google_place_id               TEXT,
  service_charge_rate           NUMERIC(5,4) DEFAULT 0.0000,
  -- 予約関連
  reservation_enabled           BOOLEAN DEFAULT false,
  reservation_confirmation_mode TEXT DEFAULT 'manual' CHECK (reservation_confirmation_mode IN ('auto', 'manual')),
  reservation_require_card      BOOLEAN DEFAULT false,
  reservation_cancellation_fee  INTEGER DEFAULT 0,
  reservation_cancel_deadline_hours INTEGER DEFAULT 24,
  max_reservation_capacity      INTEGER,
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stores' AND policyname='stores_select_authenticated') THEN
    CREATE POLICY "stores_select_authenticated" ON stores FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stores_display_id ON stores (display_id);

DROP TRIGGER IF EXISTS trg_stores_updated_at ON stores;
CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON stores FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 1-4. store_hours（営業時間）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_hours (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time  TIME,
  close_time TIME,
  is_closed  BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE store_hours ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='store_hours' AND policyname='store_hours_select_all') THEN
    CREATE POLICY "store_hours_select_all" ON store_hours FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='store_hours' AND policyname='store_hours_service_role_all') THEN
    CREATE POLICY "store_hours_service_role_all" ON store_hours FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1-5. staff_accounts（スタッフアカウント）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  corp_id       UUID REFERENCES corporations(id) ON DELETE CASCADE,
  brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,
  store_id      UUID REFERENCES stores(id) ON DELETE SET NULL,
  name          TEXT,
  email         TEXT,
  role          TEXT DEFAULT 'staff',
  display_id    TEXT UNIQUE NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_accounts_display_id ON staff_accounts (display_id);

-- ############################################################
-- カテゴリ 2: 商品・メニュー
-- ############################################################

-- ------------------------------------------------------------
-- 2-1. product_categories（商品カテゴリ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 2-2. products（商品）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         INTEGER DEFAULT 0,
  image_url     TEXT,
  tags          JSONB DEFAULT '[]',
  sale_status   TEXT DEFAULT 'on_sale',
  is_available  BOOLEAN DEFAULT true,
  is_alcohol    BOOLEAN DEFAULT false,
  dine_in       BOOLEAN DEFAULT true,
  takeout       BOOLEAN DEFAULT true,
  delivery      BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 2-3. product_sizes（商品サイズ・価格バリエーション）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_sizes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'default',
  price       INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 2-4. menu_patterns（メニューパターン管理）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_patterns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, code)
);

ALTER TABLE menu_patterns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_patterns' AND policyname='service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON menu_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_patterns' AND policyname='authenticated_read_own_brands') THEN
    CREATE POLICY "authenticated_read_own_brands" ON menu_patterns FOR SELECT TO authenticated
      USING (
        brand_id IN (
          SELECT b.id FROM brands b
            JOIN staff_accounts sa ON sa.corp_id = b.corp_id
            WHERE sa.auth_user_id = auth.uid()
          UNION
          SELECT bp.brand_id FROM brand_permissions bp
            WHERE bp.account_id IN (
              SELECT sa2.id FROM staff_accounts sa2 WHERE sa2.auth_user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

-- ************************************************************
-- ★ 新規: products.menu_pattern_id カラム追加
--   NULL許可・既存データはNULL・menu_patterns.id へのFK
-- ************************************************************
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'menu_pattern_id'
  ) THEN
    ALTER TABLE products ADD COLUMN menu_pattern_id UUID REFERENCES menu_patterns(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_menu_pattern_id ON products (menu_pattern_id);

-- ############################################################
-- カテゴリ 3: 会員・認証
-- ############################################################

-- ------------------------------------------------------------
-- 3-1. members（会員）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name                     TEXT,
  last_name                      TEXT,
  email                          TEXT,
  phone                          TEXT,
  gender                         TEXT CHECK (gender IN ('male', 'female', 'other', 'no_answer')),
  birth_date                     DATE,
  address_prefecture             TEXT,
  address_city                   TEXT,
  address_street                 TEXT,
  address_building               TEXT,
  stripe_customer_id             TEXT,
  line_user_id                   TEXT,
  favorite_store_ids             UUID[] DEFAULT '{}',
  current_rank_id                UUID,
  total_spend                    NUMERIC DEFAULT 0,
  monthly_order_count            INTEGER DEFAULT 0,
  registration_channel           TEXT,
  -- 退会関連
  withdrawal_status              TEXT CHECK (withdrawal_status IN ('active', 'pending', 'withdrawn')),
  withdrawal_requested_at        TIMESTAMPTZ,
  withdrawal_completed_at        TIMESTAMPTZ,
  withdrawal_scheduled_at        TIMESTAMPTZ,
  anonymized_at                  TIMESTAMPTZ,
  -- メール確認
  email_verification_sent_at     TIMESTAMPTZ,
  email_verification_resend_count INTEGER DEFAULT 0,
  verification_grace_sent_at     TIMESTAMPTZ,
  verification_grace_expires_at  TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ DEFAULT now(),
  updated_at                     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_auth_user_id ON members(auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_line_user_id ON members(line_user_id);
CREATE INDEX IF NOT EXISTS idx_members_withdrawal_status ON members(withdrawal_status) WHERE withdrawal_status IS NOT NULL;

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='members' AND policyname='members_select_own') THEN
    CREATE POLICY "members_select_own" ON members FOR SELECT USING (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='members' AND policyname='members_update_own') THEN
    CREATE POLICY "members_update_own" ON members FOR UPDATE USING (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='members' AND policyname='members_insert_own') THEN
    CREATE POLICY "members_insert_own" ON members FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='members' AND policyname='members_service_role_all') THEN
    CREATE POLICY "members_service_role_all" ON members FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_members_updated_at ON members;
CREATE TRIGGER set_members_updated_at
  BEFORE UPDATE ON members FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 3-2. coupons（クーポンマスタ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  discount_type TEXT DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
  discount_value INTEGER DEFAULT 0,
  min_order_amount INTEGER DEFAULT 0,
  max_uses    INTEGER,
  is_active   BOOLEAN DEFAULT true,
  starts_at   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 3-3. member_coupons（会員クーポン付与）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_coupons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  coupon_id  UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  is_used    BOOLEAN DEFAULT false,
  used_at    TIMESTAMPTZ,
  granted_at TIMESTAMPTZ DEFAULT now(),
  source     TEXT DEFAULT 'first_time' CHECK (source IN ('first_time', 'campaign', 'manual', 'birthday', 'rank'))
);

ALTER TABLE member_coupons ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_member_coupons_member ON member_coupons(member_id);
CREATE INDEX IF NOT EXISTS idx_member_coupons_coupon ON member_coupons(coupon_id);

-- ############################################################
-- カテゴリ 4: ポイント・ランク
-- ############################################################

-- ------------------------------------------------------------
-- 4-1. point_settings（ブランド別ポイント設定）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS point_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  earn_rate       NUMERIC(5,4) DEFAULT 0.01,
  use_rate        NUMERIC(5,2) DEFAULT 1.00,
  expiry_months   INTEGER DEFAULT 12,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id)
);

-- ------------------------------------------------------------
-- 4-2. rank_settings（ランク設定）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rank_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  rank_order        INTEGER DEFAULT 0,
  condition_type    TEXT CHECK (condition_type IN ('monthly_count', 'total_spend')),
  condition_value   NUMERIC DEFAULT 0,
  point_multiplier  NUMERIC(3,2) DEFAULT 1.00,
  birthday_coupon   BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 4-3. point_transactions（ポイント取引ログ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS point_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  brand_id      UUID REFERENCES brands(id) ON DELETE SET NULL,
  order_id      UUID,
  amount        INTEGER NOT NULL,
  balance_after INTEGER,
  source        TEXT DEFAULT 'normal' CHECK (source IN ('normal', 'aiden_compensation', 'review')),
  description   TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_member_created ON point_transactions(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_point_transactions_source ON point_transactions(source);
CREATE INDEX IF NOT EXISTS idx_point_transactions_order ON point_transactions(order_id);

-- ------------------------------------------------------------
-- 4-4. review_point_settings（口コミポイント設定）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_point_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  points_per_review INTEGER DEFAULT 50,
  monthly_limit   INTEGER DEFAULT 5,
  approval_mode   TEXT DEFAULT 'auto' CHECK (approval_mode IN ('auto', 'manual')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id)
);

-- ------------------------------------------------------------
-- 4-5. review_tokens（口コミ投稿トークン）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID,
  member_id  UUID REFERENCES members(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 4-6. first_time_incentives（初回特典）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS first_time_incentives (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('point', 'coupon', 'both')),
  point_amount INTEGER DEFAULT 0,
  coupon_id    UUID REFERENCES coupons(id) ON DELETE SET NULL,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id)
);

ALTER TABLE first_time_incentives ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 5: 注文・決済
-- ############################################################

-- ------------------------------------------------------------
-- 5-1. orders（注文）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             UUID REFERENCES stores(id) ON DELETE SET NULL,
  member_id            UUID REFERENCES members(id) ON DELETE SET NULL,
  corp_id              UUID REFERENCES corporations(id) ON DELETE SET NULL,
  brand_id             UUID REFERENCES brands(id) ON DELETE SET NULL,
  order_type           TEXT DEFAULT 'takeout',
  status               TEXT DEFAULT 'pending',
  total_amount         INTEGER DEFAULT 0,
  -- 決済
  payment_intent_id    TEXT,
  payment_status       TEXT DEFAULT 'pending',
  card_fingerprint     TEXT,
  application_fee_amount INTEGER,
  -- ポイント利用
  aiden_points_used    INTEGER DEFAULT 0,
  normal_points_used   INTEGER DEFAULT 0,
  -- 返金
  refund_amount        INTEGER,
  refund_reason        TEXT,
  refunded_at          TIMESTAMPTZ,
  refunded_by          UUID,
  -- ゲスト情報
  customer_name        TEXT,
  customer_email       TEXT,
  customer_phone       TEXT,
  -- 配送
  delivery_address     TEXT,
  delivery_lat         NUMERIC,
  delivery_lng         NUMERIC,
  -- トラッキング
  tracking_token       TEXT UNIQUE,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_guest ON orders(member_id) WHERE member_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_corp_created ON orders(corp_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_brand_created ON orders(brand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_card_fingerprint ON orders(card_fingerprint, created_at DESC) WHERE card_fingerprint IS NOT NULL;

-- ------------------------------------------------------------
-- 5-2. order_items（注文明細）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  size_id     UUID,
  quantity    INTEGER DEFAULT 1,
  unit_price  INTEGER DEFAULT 0,
  subtotal    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5-3. payments（決済記録）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  stripe_payment_id TEXT,
  amount            INTEGER,
  currency          TEXT DEFAULT 'jpy',
  status            TEXT DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5-4. refunds（返金記録）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  payment_id      UUID REFERENCES payments(id) ON DELETE SET NULL,
  stripe_refund_id TEXT,
  amount          INTEGER,
  reason          TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5-5. payment_attempts（決済失敗ログ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE SET NULL,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  email           TEXT,
  phone           TEXT,
  failure_reason  TEXT,
  card_last4      TEXT,
  card_brand      TEXT,
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_attempts' AND policyname='service_role_only') THEN
    CREATE POLICY "service_role_only" ON payment_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ############################################################
-- カテゴリ 6: 予約
-- ############################################################

-- ------------------------------------------------------------
-- 6-1. reservations（来店予約）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id              UUID REFERENCES members(id) ON DELETE SET NULL,
  display_id               TEXT UNIQUE,
  reservation_date         DATE NOT NULL,
  reservation_time         TIME NOT NULL,
  party_size               INTEGER NOT NULL DEFAULT 1,
  seat_type                TEXT DEFAULT 'any',
  guest_name               TEXT,
  guest_phone              TEXT,
  guest_email              TEXT,
  status                   TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'cancel_requested', 'no_show', 'completed')),
  stripe_payment_method_id TEXT,
  cancellation_fee_amount  INTEGER DEFAULT 0,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 7: 請求・サブスクリプション
-- ############################################################

-- ------------------------------------------------------------
-- 7-1. service_subscriptions（サービス契約）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  service_key TEXT NOT NULL,
  plan        TEXT DEFAULT 'std',
  plan_price  INTEGER,
  status      TEXT DEFAULT 'active',
  downgrade_at DATE,
  starts_at   TIMESTAMPTZ DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE service_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_subscriptions_entity_key
  ON service_subscriptions (entity_type, entity_id, service_key);

-- ------------------------------------------------------------
-- 7-2. fee_schedules（法人別手数料）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corporation_id  UUID NOT NULL REFERENCES corporations(id) ON DELETE CASCADE,
  fee_type        TEXT NOT NULL CHECK (fee_type IN ('dinein', 'takeout', 'delivery')),
  rate            DECIMAL(5,4) NOT NULL,
  is_base         BOOLEAN NOT NULL DEFAULT true,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_schedules_base
  ON fee_schedules (corporation_id, fee_type) WHERE is_base = true;

ALTER TABLE fee_schedules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fee_schedules' AND policyname='service_role_only') THEN
    CREATE POLICY "service_role_only" ON fee_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7-3. invoices（請求書）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corp_id            UUID REFERENCES corporations(id) ON DELETE SET NULL,
  billing_period     TEXT,
  total_amount       INTEGER DEFAULT 0,
  platform_fee       INTEGER DEFAULT 0,
  stripe_fee         INTEGER DEFAULT 0,
  adjustments        INTEGER DEFAULT 0,
  adjustment_details JSONB,
  pdf_url            TEXT,
  status             TEXT DEFAULT 'draft',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invoices_corp_period ON invoices(corp_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ############################################################
-- カテゴリ 8: カスタマーサポート
-- ############################################################

-- ------------------------------------------------------------
-- 8-1. support_tickets（サポートチケット）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  staff_account_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  type             TEXT NOT NULL DEFAULT 'ticket' CHECK (type IN ('realtime', 'ticket')),
  category         TEXT NOT NULL DEFAULT 'settings' CHECK (category IN ('order_payment', 'settings', 'billing', 'feature_request')),
  subject          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_support_tickets_brand ON support_tickets(brand_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- ------------------------------------------------------------
-- 8-2. support_messages（チケットメッセージ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'aiden')),
  sender_id   UUID,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);

-- ------------------------------------------------------------
-- 8-3. customer_chats（エンドユーザー→店舗チャット）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_chats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  member_id        UUID REFERENCES members(id) ON DELETE SET NULL,
  guest_identifier TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customer_chats ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customer_chats_store ON customer_chats(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_chats_status ON customer_chats(status);

-- ------------------------------------------------------------
-- 8-4. customer_chat_messages（チャットメッセージ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID NOT NULL REFERENCES customer_chats(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'store')),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customer_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customer_chat_messages_chat ON customer_chat_messages(chat_id);

-- ------------------------------------------------------------
-- 8-5. faqs（FAQ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faqs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID REFERENCES brands(id) ON DELETE CASCADE,
  category   TEXT NOT NULL DEFAULT 'other',
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_common  BOOLEAN DEFAULT false,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_faqs_brand ON faqs(brand_id);
CREATE INDEX IF NOT EXISTS idx_faqs_common ON faqs(is_common) WHERE is_common = true;

-- ############################################################
-- カテゴリ 9: AIチャット・RAG
-- ############################################################

-- ------------------------------------------------------------
-- 9-1. store_policies（店舗運営方針）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE,
  brand_id    UUID REFERENCES brands(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('refund', 'allergen', 'business_hours', 'takeout_delivery', 'points_coupons', 'other')),
  title       TEXT,
  content     TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 9-2. chat_sessions（AIチャットセッション）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE SET NULL,
  member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
  session_type  TEXT NOT NULL CHECK (session_type IN ('merchant', 'enduser')),
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'resolved', 'closed')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 9-3. chat_messages（AIチャットメッセージ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  feedback    TEXT CHECK (feedback IN ('helpful', 'not_helpful')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 9-4. faq_embeddings（RAG用ベクトル埋め込み）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faq_embeddings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id     UUID REFERENCES faqs(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  embedding  vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ############################################################
-- カテゴリ 10: AI利用ログ
-- ############################################################

-- ------------------------------------------------------------
-- 10-1. ai_interactions（AI機能利用ログ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_interactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID REFERENCES stores(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('review_reply', 'sns_post', 'pop_image', 'monthly_comment')),
  tokens_used      INTEGER DEFAULT 0,
  model            TEXT,
  input_text       TEXT,
  output_text      TEXT,
  status           TEXT DEFAULT 'success',
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 11: Google口コミ・競合分析
-- ############################################################

-- ------------------------------------------------------------
-- 11-1. google_places（Google Maps飲食店データ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_places (
  place_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  latitude    NUMERIC,
  longitude   NUMERIC,
  rating      NUMERIC(2,1),
  review_count INTEGER DEFAULT 0,
  ward        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE google_places ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-2. google_reviews（Google口コミ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id     TEXT NOT NULL REFERENCES google_places(place_id) ON DELETE CASCADE,
  author       TEXT,
  rating       INTEGER,
  text         TEXT,
  language     TEXT,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(place_id, author, published_at)
);

ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-3. competitor_mappings（加盟店←→競合店の紐づけ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_mappings (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id  UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  place_id  TEXT NOT NULL REFERENCES google_places(place_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, place_id)
);

ALTER TABLE competitor_mappings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-4. collection_progress（バックグラウンド収集進捗）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_progress (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward      TEXT,
  grid_lat  NUMERIC,
  grid_lng  NUMERIC,
  status    TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ward, grid_lat, grid_lng)
);

ALTER TABLE collection_progress ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-5. review_alerts（ネガティブ口コミアラート）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_review_id UUID NOT NULL REFERENCES google_reviews(id) ON DELETE CASCADE,
  store_id         UUID REFERENCES stores(id) ON DELETE SET NULL,
  severity         TEXT DEFAULT 'warning',
  is_resolved      BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(google_review_id)
);

ALTER TABLE review_alerts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-6. competitor_collection_config（POC収集設定）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_collection_config (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id  UUID REFERENCES stores(id) ON DELETE CASCADE,
  latitude  NUMERIC,
  longitude NUMERIC,
  radius_m  INTEGER DEFAULT 3000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 11-7. competitor_stores（競合店舗マスタ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  address         TEXT,
  latitude        NUMERIC,
  longitude       NUMERIC,
  rating          NUMERIC(2,1),
  review_count    INTEGER DEFAULT 0,
  business_hours  JSONB,
  popular_times   JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE competitor_stores ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-8. competitor_reviews（競合店舗レビュー）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_store_id UUID NOT NULL REFERENCES competitor_stores(id) ON DELETE CASCADE,
  google_review_id    TEXT,
  author              TEXT,
  rating              INTEGER,
  text                TEXT,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(competitor_store_id, google_review_id)
);

ALTER TABLE competitor_reviews ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11-9. competitor_metrics_weekly（週次スナップショット）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_metrics_weekly (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_store_id UUID NOT NULL REFERENCES competitor_stores(id) ON DELETE CASCADE,
  week_start          DATE NOT NULL,
  avg_rating          NUMERIC(2,1),
  new_review_count    INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(competitor_store_id, week_start)
);

ALTER TABLE competitor_metrics_weekly ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 12: ゲスト注文管理
-- ############################################################

-- ------------------------------------------------------------
-- 12-1. guest_registration_prompt（会員登録促進設定）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_registration_prompt (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  is_enabled     BOOLEAN DEFAULT false,
  prompt_message TEXT DEFAULT '会員登録すると次回のご注文がもっと便利に！',
  incentive_text TEXT DEFAULT '今なら100ポイントプレゼント！',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id)
);

ALTER TABLE guest_registration_prompt ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 13: 監視・監査
-- ############################################################

-- ------------------------------------------------------------
-- 13-1. audit_logs（監査ログ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT,
  details     JSONB,
  actor_id    UUID,
  actor_email TEXT,
  entity_type TEXT,
  entity_id   UUID,
  ip_address  TEXT,
  log_level   TEXT DEFAULT 'INFO' CHECK (log_level IN ('INFO', 'WARN', 'ERR')),
  member_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_log_level ON audit_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_member_id ON audit_logs(member_id);

-- ------------------------------------------------------------
-- 13-2. monitoring_alerts（データ使用量監視アラート）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type      TEXT NOT NULL,
  severity        TEXT DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
  current_value   NUMERIC,
  threshold_value NUMERIC,
  message         TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 14: ブランドHP
-- ############################################################

-- ------------------------------------------------------------
-- 14-1. brand_news（ブランドニュース）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_news (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  body_html  TEXT,
  image_url  TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 14-2. brand_hero_slides（ヒーロースライド）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_hero_slides (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  media_url  TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  alt_text   TEXT,
  sort_order INT DEFAULT 0,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brand_hero_slides ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS brand_hero_slides_brand_sort_idx ON brand_hero_slides(brand_id, sort_order);

-- ------------------------------------------------------------
-- 14-3. brand_campaigns（キャンペーン）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  media_url   TEXT,
  media_type  TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  link_url    TEXT,
  start_date  DATE,
  end_date    DATE,
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brand_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS brand_campaigns_brand_sort_idx ON brand_campaigns(brand_id, sort_order);
CREATE INDEX IF NOT EXISTS brand_campaigns_date_range_idx ON brand_campaigns(start_date, end_date);

-- ############################################################
-- カテゴリ 15: SNS連携
-- ############################################################

-- ------------------------------------------------------------
-- 15-1. sns_connections（SNSアカウント連携）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sns_connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  account_id  TEXT,
  access_token TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sns_connections ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 15-2. sns_posts（SNS投稿）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sns_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  content     TEXT,
  media_url   TEXT,
  posted_at   TIMESTAMPTZ,
  status      TEXT DEFAULT 'draft',
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sns_posts ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- カテゴリ 16: 権限管理
-- ############################################################

-- ------------------------------------------------------------
-- 16-1. brand_permissions（FC対応ブランド権限）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, brand_id)
);

ALTER TABLE brand_permissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brand_permissions' AND policyname='service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON brand_permissions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brand_permissions' AND policyname='authenticated_read_own') THEN
    CREATE POLICY "authenticated_read_own" ON brand_permissions FOR SELECT TO authenticated
      USING (account_id IN (SELECT id FROM staff_accounts WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 16-2. user_bans（BAN管理）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_bans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     TEXT NOT NULL CHECK (target_type IN ('member', 'guest')),
  target_id       UUID,
  target_email    TEXT,
  target_phone    TEXT,
  scope_type      TEXT NOT NULL CHECK (scope_type IN ('global', 'corporation', 'brand', 'store')),
  scope_id        UUID,
  ban_type        TEXT NOT NULL CHECK (ban_type IN ('service_specific', 'all_except_dinein')),
  banned_services JSONB DEFAULT '[]',
  reason          TEXT,
  banned_by       UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_bans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_bans' AND policyname='service_role_only') THEN
    CREATE POLICY "service_role_only" ON user_bans FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ############################################################
-- カテゴリ 17: プラットフォーム設定
-- ############################################################

-- ------------------------------------------------------------
-- 17-1. platform_settings（プラットフォーム設定）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='platform_settings' AND policyname='service_role_only') THEN
    CREATE POLICY "service_role_only" ON platform_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ############################################################
-- カテゴリ 18: デバイス・通知
-- ############################################################

-- ------------------------------------------------------------
-- 18-1. device_tokens（FCMプッシュ通知トークン）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  store_id    UUID REFERENCES stores(id) ON DELETE SET NULL,
  token       TEXT NOT NULL,
  platform    TEXT CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, token)
);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- ビュー
-- ############################################################

-- guest_order_summaries（ゲスト注文集計ビュー）
CREATE OR REPLACE VIEW guest_order_summaries AS
SELECT
  encode(digest(
    (COALESCE(o.customer_email, '') || '::' || COALESCE(o.customer_phone, '')),
    'sha256'), 'hex') AS guest_identifier,
  o.store_id,
  s.name AS store_name,
  s.brand_id,
  COUNT(*)::int AS order_count,
  SUM(o.total_amount)::numeric AS total_amount,
  MAX(o.created_at) AS last_order_at
FROM orders o
LEFT JOIN stores s ON s.id = o.store_id
WHERE o.member_id IS NULL
  AND o.customer_email IS NOT NULL
GROUP BY 1, o.store_id, s.name, s.brand_id;

-- orders_dashboard_view（PII除外ダッシュボード用）
CREATE OR REPLACE VIEW orders_dashboard_view AS
SELECT
  id, store_id, order_type, status, total_amount,
  payment_status, payment_intent_id, tracking_token,
  created_at, updated_at
FROM orders;

-- ai_monthly_usage（月次AI利用回数集計）
CREATE OR REPLACE VIEW ai_monthly_usage AS
SELECT
  store_id,
  interaction_type,
  date_trunc('month', created_at) AS month,
  COUNT(*) AS usage_count
FROM ai_interactions
WHERE status = 'success'
GROUP BY store_id, interaction_type, date_trunc('month', created_at);

-- ############################################################
-- RPC関数
-- ############################################################

-- FAQベクトル検索
CREATE OR REPLACE FUNCTION match_faq_embeddings(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (id UUID, faq_id UUID, content TEXT, similarity FLOAT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fe.id, fe.faq_id, fe.content,
    1 - (fe.embedding <=> query_embedding) AS similarity
  FROM faq_embeddings fe
  WHERE 1 - (fe.embedding <=> query_embedding) > match_threshold
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- DB監視 RPC
CREATE OR REPLACE FUNCTION get_db_size() RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pg_database_size(current_database());
$$;

CREATE OR REPLACE FUNCTION get_storage_size() RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(pg_total_relation_size(schemaname || '.' || tablename)), 0)::BIGINT
  FROM pg_tables WHERE schemaname = 'storage';
$$;

CREATE OR REPLACE FUNCTION get_active_connections() RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'active';
$$;

CREATE OR REPLACE FUNCTION get_monthly_active_users(since TIMESTAMPTZ DEFAULT now() - interval '30 days')
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(DISTINCT auth_user_id)::INTEGER FROM members
  WHERE updated_at >= since;
$$;

-- AI利用枠チェック
CREATE OR REPLACE FUNCTION check_ai_quota(
  p_store_id UUID,
  p_interaction_type TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT ss.plan INTO v_plan
  FROM service_subscriptions ss
  JOIN stores st ON st.id = p_store_id
  WHERE ss.entity_type = 'store' AND ss.entity_id = p_store_id AND ss.service_key = 'mo'
  LIMIT 1;

  IF v_plan IS NULL OR v_plan = 'std' THEN
    SELECT COUNT(*) INTO v_count FROM ai_interactions
    WHERE store_id = p_store_id
      AND interaction_type = p_interaction_type
      AND created_at >= date_trunc('month', now());

    v_limit := CASE p_interaction_type
      WHEN 'review_reply' THEN 10
      WHEN 'sns_post' THEN 10
      WHEN 'pop_image' THEN 1
      WHEN 'monthly_comment' THEN 1
      ELSE 0
    END;

    RETURN v_count < v_limit;
  END IF;

  RETURN true;
END;
$$;

-- トラッキングトークンで注文取得
CREATE OR REPLACE FUNCTION get_order_by_tracking_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'order', row_to_json(o),
    'items', COALESCE((
      SELECT jsonb_agg(row_to_json(oi))
      FROM order_items oi WHERE oi.order_id = o.id
    ), '[]'::jsonb),
    'store', row_to_json(s),
    'brand', row_to_json(b)
  ) INTO v_result
  FROM orders o
  LEFT JOIN stores s ON s.id = o.store_id
  LEFT JOIN brands b ON b.id = s.brand_id
  WHERE o.tracking_token = p_token
  LIMIT 1;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_by_tracking_token(TEXT) TO anon, authenticated;

-- ポイント差引
CREATE OR REPLACE FUNCTION deduct_points(
  p_member_id UUID,
  p_brand_id UUID,
  p_amount INTEGER,
  p_order_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM point_transactions WHERE order_id = p_order_id AND amount < 0) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM point_transactions
  WHERE member_id = p_member_id AND brand_id = p_brand_id;

  IF v_balance < p_amount THEN
    RETURN false;
  END IF;

  INSERT INTO point_transactions (member_id, brand_id, order_id, amount, balance_after, source, description)
  VALUES (p_member_id, p_brand_id, p_order_id, -p_amount, v_balance - p_amount, 'normal', 'ポイント利用');

  RETURN true;
END;
$$;

-- 補償ポイント付与
CREATE OR REPLACE FUNCTION grant_compensation_points(
  p_member_id UUID,
  p_brand_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_granted_by UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM point_transactions
  WHERE member_id = p_member_id AND brand_id = p_brand_id;

  INSERT INTO point_transactions (member_id, brand_id, amount, balance_after, source, description, expires_at)
  VALUES (p_member_id, p_brand_id, p_amount, v_balance + p_amount, 'aiden_compensation', p_reason, now() + interval '12 months');

  RETURN true;
END;
$$;

-- ランク自動昇格チェック
CREATE OR REPLACE FUNCTION check_and_upgrade_rank(
  p_member_id UUID,
  p_brand_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_spend NUMERIC;
  v_rank_id UUID;
BEGIN
  SELECT total_spend INTO v_spend FROM members WHERE id = p_member_id;

  SELECT id INTO v_rank_id
  FROM rank_settings
  WHERE brand_id = p_brand_id AND condition_type = 'total_spend' AND condition_value <= v_spend
  ORDER BY condition_value DESC
  LIMIT 1;

  IF v_rank_id IS NOT NULL THEN
    UPDATE members SET current_rank_id = v_rank_id WHERE id = p_member_id;
  END IF;
END;
$$;

-- ============================================================
-- 完了
-- ============================================================
