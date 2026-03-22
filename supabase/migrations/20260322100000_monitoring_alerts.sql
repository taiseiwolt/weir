-- ============================================================
-- monitoring_alerts: データ使用量監視アラートテーブル
-- 1時間おきのサイレント監視で閾値超過時のみ記録・通知
-- ============================================================

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  check_type TEXT NOT NULL,            -- 'db_size', 'storage', 'connections', etc.
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  current_value TEXT NOT NULL,         -- 現在の値（人間が読める形式）
  threshold_value TEXT NOT NULL,       -- 閾値
  message TEXT NOT NULL,               -- アラートメッセージ
  recommended_action TEXT NOT NULL,    -- 推奨対策
  alerted_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,            -- 解消時に記録
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス: 未解決アラートの重複チェック用
CREATE INDEX idx_monitoring_alerts_unresolved
  ON monitoring_alerts (check_type, severity)
  WHERE resolved_at IS NULL;

-- RLS有効化
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- service_role のみ全操作可能（フロントからはアクセス不可）
-- RLSが有効でポリシーなし = anon/authenticated からのアクセスは全拒否
-- service_role は bypassrls 権限を持つためポリシー不要で全操作可能

COMMENT ON TABLE monitoring_alerts IS 'データ使用量監視アラート。閾値超過時にEdge Functionが記録。';
