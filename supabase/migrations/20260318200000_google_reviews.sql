-- =============================================
-- Google口コミ自動収集 + AI分析基盤
-- =============================================

-- 1. google_places: Google Mapsの飲食店データ
CREATE TABLE IF NOT EXISTS google_places (
  place_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  rating      NUMERIC(2,1),
  user_ratings_total INTEGER DEFAULT 0,
  price_level INTEGER,
  types       TEXT[],
  business_status TEXT,
  ward        VARCHAR(20),
  last_fetched_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_google_places_ward ON google_places (ward);
CREATE INDEX idx_google_places_rating ON google_places (rating);
CREATE INDEX idx_google_places_latlng ON google_places (lat, lng);

-- 2. google_reviews: Google口コミデータ
CREATE TABLE IF NOT EXISTS google_reviews (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id    TEXT NOT NULL REFERENCES google_places(place_id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        TEXT,
  language    VARCHAR(10),
  relative_time_description TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (place_id, author_name, published_at)
);

CREATE INDEX idx_google_reviews_place ON google_reviews (place_id);
CREATE INDEX idx_google_reviews_rating ON google_reviews (rating);
CREATE INDEX idx_google_reviews_published ON google_reviews (published_at DESC);

-- 3. stores テーブルに google_place_id カラム追加
ALTER TABLE stores ADD COLUMN IF NOT EXISTS google_place_id TEXT;
CREATE INDEX IF NOT EXISTS idx_stores_google_place_id ON stores (google_place_id);

-- 4. competitor_mappings: 加盟店と競合の紐づけ
CREATE TABLE IF NOT EXISTS competitor_mappings (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  place_id        TEXT NOT NULL REFERENCES google_places(place_id) ON DELETE CASCADE,
  distance_meters INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_id, place_id)
);

CREATE INDEX idx_competitor_mappings_store ON competitor_mappings (store_id);

-- 5. collection_progress: バックグラウンド収集の進捗管理
CREATE TABLE IF NOT EXISTS collection_progress (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ward        VARCHAR(20) NOT NULL,
  grid_lat    DOUBLE PRECISION NOT NULL,
  grid_lng    DOUBLE PRECISION NOT NULL,
  status      VARCHAR(10) DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  fetched_at  TIMESTAMPTZ,
  UNIQUE (ward, grid_lat, grid_lng)
);

CREATE INDEX idx_collection_progress_ward_status ON collection_progress (ward, status);

-- 6. review_alerts: ネガティブ口コミアラート
CREATE TABLE IF NOT EXISTS review_alerts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  google_review_id UUID NOT NULL REFERENCES google_reviews(id) ON DELETE CASCADE,
  is_read          BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (google_review_id)
);

CREATE INDEX idx_review_alerts_store_unread ON review_alerts (store_id, is_read) WHERE is_read = FALSE;

-- RLS ポリシー
ALTER TABLE google_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_alerts ENABLE ROW LEVEL SECURITY;

-- service_role 用ポリシー（Edge Function からのアクセス）
CREATE POLICY "service_role_all_google_places" ON google_places FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_google_reviews" ON google_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_competitor_mappings" ON competitor_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_collection_progress" ON collection_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_review_alerts" ON review_alerts FOR ALL USING (true) WITH CHECK (true);

-- staff_accounts 経由の読み取りポリシー（管理画面からのアクセス）
CREATE POLICY "staff_read_google_reviews" ON google_reviews FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_accounts WHERE auth_user_id = auth.uid()));

CREATE POLICY "staff_read_google_places" ON google_places FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_accounts WHERE auth_user_id = auth.uid()));

CREATE POLICY "staff_read_competitor_mappings" ON competitor_mappings FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_accounts WHERE auth_user_id = auth.uid()));

CREATE POLICY "staff_read_review_alerts" ON review_alerts FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_accounts WHERE auth_user_id = auth.uid()));

CREATE POLICY "staff_update_review_alerts" ON review_alerts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM staff_accounts WHERE auth_user_id = auth.uid()));
