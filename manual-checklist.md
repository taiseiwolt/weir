# 手動確認チェックリスト

## 前提条件
- テスト環境: https://weir.co.jp
- Supabase ダッシュボード: https://supabase.com/dashboard

---

## 1. Admin ↔ Customer-Admin 店舗データ一致

- [ ] **1-1.** admin.html を開き、法人詳細→店舗一覧で店舗名を確認
- [ ] **1-2.** customer-admin.html にスタッフログイン→店舗管理で同じ店舗名が表示されること
- [ ] **1-3.** customer-admin で店舗の住所を変更 → admin.html を再読込 → 変更が反映されること
- [ ] **1-4.** 営業時間の表示が両画面で一致すること

## 2. Admin ↔ Customer-Admin 会員データ一致

- [ ] **2-1.** admin.html の会員数と customer-admin.html の会員数が一致すること
- [ ] **2-2.** 特定の会員のランク表示が両画面で一致すること（修正後: 両方 `current_rank_id` → `rank_settings` 参照）
- [ ] **2-3.** 特定の会員のポイント残高が両画面で一致すること（修正後: 両方 `point_transactions` 集計）
- [ ] **2-4.** 会員名の表示が両画面で同じ日本語順（姓 名）であること

## 3. メニューデータの確認

- [ ] **3-1.** customer-admin でメニュー（商品）を追加
- [ ] **3-2.** weir-order-store.html でその商品が表示されること
- [ ] **3-3.** weir-brand-menu.html でその商品が表示されること
- [ ] **3-4.** admin.html ではメニューがハードコードのため反映されないことを確認（既知の制限）

## 4. Dashboard ↔ Admin 注文データ一致

- [ ] **4-1.** dashboard の注文一覧件数と admin の注文一覧件数が一致すること（同一店舗フィルタ時）
- [ ] **4-2.** dashboard でステータスを「調理中」に変更 → admin.html を再読込 → ステータスが反映されること
- [ ] **4-3.** dashboard で注文をキャンセル → admin.html の注文一覧にキャンセル済みで表示されること

## 5. モバイルオーダー → 管理画面フロー

- [ ] **5-1.** weir-order-store.html でカートに追加 → checkout.html に遷移
- [ ] **5-2.** checkout.html でテストカード決済を完了
- [ ] **5-3.** weir-order-dashboard.html にリアルタイムで注文が表示されること
- [ ] **5-4.** weir-admin.html の注文一覧に同じ注文が表示されること
- [ ] **5-5.** 注文金額が全画面で一致すること

## 6. ポイント・ランクの整合性

- [ ] **6-1.** Supabase ダッシュボードで `point_transactions` テーブルを確認
- [ ] **6-2.** 特定会員の全トランザクション金額合計 = admin/customer-admin の表示ポイント であること
- [ ] **6-3.** `point_transactions` の `order_id` が NULL のレコードを確認 → 注文関連であれば要改善
- [ ] **6-4.** checkout.html で注文後、`members.total_spend` が更新されていること (Supabase ダッシュボードで確認)
- [ ] **6-5.** ランク条件を満たす注文後、`members.current_rank_id` が更新されること

## 7. RLS ポリシーの確認

- [ ] **7-1.** Supabase ダッシュボード → Authentication → Policies で各テーブルの RLS 確認
- [ ] **7-2.** `orders` テーブルの anon SELECT ポリシーが本番環境で制限されていること
- [ ] **7-3.** admin.html が anon key で members データを取得できているか確認（できない場合はデモデータにフォールバック）

## 8. API エンドポイント確認

- [ ] **8-1.** `GET /api/orders/?store_id={id}` が注文データを返すこと
- [ ] **8-2.** `PATCH /api/orders/{id}/status` に `accepted` を送信 → 200 レスポンス
- [ ] **8-3.** `POST /api/orders` で注文作成 → orders + order_items テーブルに INSERT されること
- [ ] **8-4.** Stripe webhook (`POST /api/payments/webhook`) で `payment_intent.succeeded` 受信 → `payment_status: 'captured'` に更新されること

---

## 確認結果記録

| # | 項目 | 結果 | 備考 |
|---|------|------|------|
| 1-1 | | | |
| 1-2 | | | |
| ... | | | |
