-- Realtime postgres_changes: authenticated role用SELECTポリシー追加
-- 背景: sb_publishable_キー使用時、Supabase JSクライアントはログイン済みセッション
-- (role: authenticated) でRealtimeに接続するため、anon用ポリシーだけでは
-- postgres_changesイベントが配信されなかった。

-- reservations: 認証済みユーザー（ダッシュボード管理者）が全予約をSELECT可能
CREATE POLICY "authenticated_select_all" ON reservations
  FOR SELECT TO authenticated
  USING (true);

-- orders: 認証済みユーザーが全注文をSELECT可能（Realtimeイベント配信のため）
CREATE POLICY "orders_authenticated_select_all" ON orders
  FOR SELECT TO authenticated
  USING (true);
