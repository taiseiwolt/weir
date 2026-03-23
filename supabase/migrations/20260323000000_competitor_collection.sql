-- =============================================
-- POC店舗 競合データ収集基盤
-- =============================================

-- 1. 収集設定テーブル（POC店舗の座標・半径を管理）
CREATE TABLE IF NOT EXISTS competitor_collection_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poc_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  label TEXT, -- 識別用ラベル（例: "渋谷テスト", "POC店舗A"）
  center_latitude NUMERIC NOT NULL,
  center_longitude NUMERIC NOT NULL,
  radius_meters INTEGER DEFAULT 1000,
  is_active BOOLEAN DEFAULT false, -- POC店舗決定後にtrueにする
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 競合店舗マスタ
CREATE TABLE IF NOT EXISTS competitor_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  google_place_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  price_level INTEGER, -- 0-4 (Google Places API)
  rating NUMERIC(2,1), -- 1.0-5.0
  total_ratings INTEGER DEFAULT 0,
  types TEXT[], -- カテゴリ配列
  website TEXT,
  phone TEXT,
  supports_takeout BOOLEAN,
  supports_delivery BOOLEAN,
  supports_dine_in BOOLEAN,
  supports_reservations BOOLEAN,
  photo_count INTEGER DEFAULT 0,
  opening_hours JSONB, -- 曜日別営業時間
  popular_times JSONB, -- 混雑度データ（APIで取得可能な場合）
  distance_from_poc_m INTEGER, -- POC店舗からの距離（m）
  first_collected_at TIMESTAMPTZ DEFAULT NOW(),
  last_collected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_competitor_stores_rating ON competitor_stores (rating);
CREATE INDEX idx_competitor_stores_latlng ON competitor_stores (latitude, longitude);
CREATE INDEX idx_competitor_stores_distance ON competitor_stores (distance_from_poc_m);

-- 3. 競合店舗レビュー履歴
CREATE TABLE IF NOT EXISTS competitor_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_store_id UUID NOT NULL REFERENCES competitor_stores(id) ON DELETE CASCADE,
  google_review_id TEXT, -- Google側のレビュー識別子（重複防止）
  author_name TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  text TEXT,
  language TEXT,
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_store_id, google_review_id)
);

CREATE INDEX idx_competitor_reviews_store ON competitor_reviews (competitor_store_id);
CREATE INDEX idx_competitor_reviews_rating ON competitor_reviews (rating);
CREATE INDEX idx_competitor_reviews_published ON competitor_reviews (published_at DESC);

-- 4. 競合店舗メトリクス週次スナップショット
CREATE TABLE IF NOT EXISTS competitor_metrics_weekly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_store_id UUID NOT NULL REFERENCES competitor_stores(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  rating NUMERIC(2,1),
  total_ratings INTEGER,
  new_reviews_count INTEGER DEFAULT 0,
  avg_review_rating NUMERIC(2,1),
  price_level INTEGER,
  photo_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_store_id, week_start)
);

CREATE INDEX idx_competitor_metrics_store_week ON competitor_metrics_weekly (competitor_store_id, week_start DESC);

-- RLS ポリシー（service_roleのみ）
ALTER TABLE competitor_collection_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_metrics_weekly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON competitor_collection_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON competitor_stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON competitor_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON competitor_metrics_weekly FOR ALL USING (true) WITH CHECK (true);
