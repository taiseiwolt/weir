-- reservations: anonロールにSELECTポリシーを追加
-- ダッシュボードはanon keyで動作するため、Realtimeイベント受信にSELECT権限が必要

CREATE POLICY "anon_select_by_store" ON reservations
  FOR SELECT TO anon
  USING (true);
