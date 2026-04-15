# Weir Day 3 テスト依頼書

実行日: 2026-03-22
前提: Day 1（注文フロー+モバイルUI）、Day 2（決済+受注+営業時間+配達）完了済み
セキュリティ修正: SEC-01〜04, DI-01 デプロイ・検証PASS済み

---

## 接続情報

- GitHub: https://github.com/taiseiwolt/aiden-demo
- ローカルリポジトリ: ~/Desktop/aiden-demo
- 作業ディレクトリ（HTML）: ~/Desktop/aiden.html/
- 本番URL: https://xorder.co.jp
- Supabase URL: https://iikwusprydaogzeslgdz.supabase.co
- Supabase Anon Key: sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC
- Supabase Legacy JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（Edge Function認証用）
- Access Token: sbp_0bc989fd83759e2909944e4a7117b341834c19b8（期限: 2026-04-15）
- Stripe Publishable Key: pk_test_51TAiXe8IrssGKLKQ...
- Stripe Secret Key: Supabase SecretsにSTRIPE_SECRET_KEYとして設定済み

---

## テスト結果の記録ルール

- 全テスト結果を `~/Desktop/aiden-demo/test-results/day3-results.md` に記録
- 各テストに **PASS / FAIL / SKIP（理由）** を記載
- FAILの場合: 原因特定→修正→再テストまで実施。修正内容もday3-results.mdに記録
- 重要度: 🔴Critical（FAIL時はPOC Go判定不可） / 🟡Warning / ℹ️Info

---

## Phase 1: セキュリティ追加検証（SEC修正後のリグレッション確認）🔴Critical

SEC-01〜04の修正がデプロイ済み。既存機能が壊れていないことを確認する。

### SEC-R1: 注文フローE2Eリグレッション
1. https://xorder.co.jp を開く（weir-order-store.html）
2. 店舗を選択 → メニュー表示確認
3. 商品をカートに追加 → チェックアウト画面遷移
4. チェックアウト画面で金額表示が正しいか確認（小計、配達料、サービス料、合計）
5. **ここまでで確認完了**（カード入力はStripe Elementsのため手動テスト対象）
- 期待: 画面遷移・金額表示に異常なし
- 重要度: 🔴Critical

### SEC-R2: 受注ダッシュボード表示確認
1. weir-order-dashboard.html を開く
2. 既存注文が正しく表示されるか確認（orders_public_viewからの取得に切り替わったため）
3. 注文詳細に **customer_name, email, phone が表示されないこと** を確認（ビュー経由）
4. ステータス変更ボタンが機能するか確認
- 期待: ダッシュボード正常動作、PII非表示
- 重要度: 🔴Critical

### SEC-R3: トラッキングページ確認
1. weir-order-tracking.html を既存注文IDで表示
2. orders_public_view経由のクエリで正しく表示されるか
3. ステータス・残り時間・注文内容が表示されるか
- 期待: トラッキング正常表示
- 重要度: 🔴Critical

---

## Phase 2: 3-way金額照合テスト 🔴Critical

UI・DB・Stripe間で金額が一致することを検証する。
Day 2の決済テスト時に作成された注文データを使用。

### DI-02: DB金額フィールド照合
```sql
-- Supabase SQLまたはcurl経由で実行
SELECT 
  id,
  total_amount,
  delivery_fee,
  service_fee,
  surcharge_amount,
  (total_amount - delivery_fee - service_fee - COALESCE(surcharge_amount, 0)) as item_subtotal,
  stripe_payment_intent_id
FROM orders
ORDER BY created_at DESC
LIMIT 5;
```
- 確認: delivery_fee, service_fee, surcharge_amount が全てNULLでないこと（DI-01で追加したカラム）
- 確認: total_amount = item_subtotal + delivery_fee + service_fee + surcharge_amount
- 重要度: 🔴Critical

### DI-03: DB vs Stripe照合
1. 上記のstripe_payment_intent_idを使用
2. Stripe API経由でPaymentIntentを取得（Supabase Edge Function経由、またはStripe Dashboard確認手順を記載）
3. `orders.total_amount` と `PaymentIntent.amount`（円単位）が一致するか確認
- 期待: 全件一致
- 重要度: 🔴Critical
- **注**: Stripe Secret KeyはSupabase Secretsにあるため、直接API呼び出しは不可。代替方法:
  - Stripe Dashboard (https://dashboard.stripe.com/test/payments) で該当PaymentIntentを検索
  - または、検証用Edge Functionを一時的に作成してamountを返すAPIを作る
  - いずれも不可の場合は手動確認としてSKIP（手順のみ記載）

### DI-04: order_items金額照合
```sql
SELECT 
  o.id as order_id,
  o.total_amount,
  o.delivery_fee,
  o.service_fee,
  o.surcharge_amount,
  SUM(oi.subtotal) as items_total,
  (SUM(oi.subtotal) + o.delivery_fee + o.service_fee + COALESCE(o.surcharge_amount, 0)) as calculated_total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.total_amount, o.delivery_fee, o.service_fee, o.surcharge_amount
ORDER BY o.created_at DESC
LIMIT 5;
```
- 確認: `total_amount` = `calculated_total`（全件一致）
- 重要度: 🔴Critical

---

## Phase 3: タイムゾーンテスト 🟡Warning

### TZ-01: DB保存タイムスタンプ確認
```sql
SELECT 
  id,
  created_at,
  created_at AT TIME ZONE 'Asia/Tokyo' as jst_time,
  NOW() as db_now,
  NOW() AT TIME ZONE 'Asia/Tokyo' as db_now_jst
FROM orders
ORDER BY created_at DESC
LIMIT 3;
```
- 確認: created_atがUTCで保存されているか、JSTで保存されているか確認
- 記録: SupabaseのデフォルトTZ設定を確認（`SHOW timezone;`）

### TZ-02: フロント表示時刻確認
1. weir-order-tracking.html で注文の時刻表示を確認
2. 表示時刻がJST（日本時間）になっているか
3. DB保存値との対応関係を記録
- 重要度: 🟡Warning

### TZ-03: pg_cronジョブのTZ確認
```sql
SELECT jobname, schedule, command 
FROM cron.job 
ORDER BY jobname;
```
- 確認: スケジュール時刻がUTC or JSTどちらで設定されているか
- 確認: fn_cron_auto_status_switchの実行タイミングが営業時間と整合するか
- 重要度: 🟡Warning

---

## Phase 4: バリデーション・エッジケーステスト 🟡Warning

### E4-01: カート商品数上限
1. weir-order-store.html を開く
2. 同じ商品を連続でカートに追加（+ボタン連打 or 数量変更）
3. 上限があるか確認（50個? 100個? 上限なし?）
4. 上限なしの場合: カートに大量追加してcheckout画面に進み、金額計算が正しいか確認
- 期待: 何らかの上限チェックがあること（なければ🟡Warning報告）
- 重要度: 🟡Warning

### E4-02: カート空でチェックアウトアクセス
1. カートが空の状態でweir-order-checkout.htmlに直接アクセス
2. エラー表示 or リダイレクトされるか
- 期待: 空カートでの注文不可
- 重要度: 🟡Warning

### E4-03: 不正な金額パラメータ
1. checkout画面のURL/localStorage/sessionStorageを確認
2. カートデータがクライアント側で改ざん可能か確認
3. 改ざん可能な場合: 金額を変更してEdge Functionに送信した場合、サーバー側で正しい金額を再計算しているか
- 期待: サーバー側で金額再計算（クライアント送信値を信用しない）
- 重要度: 🔴Critical

### E4-04: 電話番号バリデーション
1. チェックアウト画面で不正な電話番号を入力テスト（文字混在、桁数過不足）
2. バリデーションエラーが表示されるか
- テスト値: "abc", "090", "0901234567890123"（桁数超過）, "090-1234-5678"（ハイフンあり）
- 重要度: 🟡Warning

### E4-05: メールアドレスバリデーション
1. 不正なメール形式のテスト
- テスト値: "test", "test@", "@test.com", "test@test"
- 重要度: 🟡Warning

---

## Phase 5: BANテスト 🟡Warning

### E5-01: BAN登録確認
```sql
SELECT * FROM banned_users;
```
- BAN機能のテーブル構造を確認（テーブル名が異なる場合は探索）

### E5-02: BAN登録→注文ブロック
1. テスト用メールアドレスをBANリストに登録
2. そのメールアドレスでチェックアウトを試みる
3. 注文がブロックされるか確認
4. ブロック時のエラーメッセージ内容を記録
5. **テスト後: テスト用BANデータを削除**
- 期待: BAN登録メールでの注文不可
- 重要度: 🟡Warning
- **注**: BAN機能が未実装の場合はSKIP（テーブル有無で判断）

---

## Phase 6: タイマー・スケジュールテスト 🟡Warning

### T-01: トラッキング残り時間（既知バグ）
1. weir-order-tracking.html を表示
2. 残り時間が49分固定で動かないバグの現状確認
3. JSコードを確認して原因特定
4. **修正可能であれば修正**（カウントダウンが正しく動くように）
- 現状: 🔴既知バグ（49分固定）
- 重要度: 🟡Warning（修正推奨）

### T-02: pg_cron全ジョブ稼働確認
```sql
-- ジョブ一覧
SELECT jobname, schedule, active, command FROM cron.job ORDER BY jobname;

-- 直近の実行ログ
SELECT jobid, job_name, status, start_time, end_time 
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```
- 確認: 全ジョブがactive=trueか
- 確認: 直近実行でfailureがないか
- 重要度: 🟡Warning

### T-03: 自動ステータス切替テスト
fn_cron_auto_status_switchを手動実行して動作確認:
```sql
SELECT fn_cron_auto_status_switch();
```
- 確認: エラーなく実行されるか
- 確認: 対象の注文があればステータスが切り替わるか
- 重要度: 🟡Warning

### T-04: 月次注文数リセット関数テスト
```sql
-- 関数名を確認して手動実行（Agent 5指摘: 月初待ちではなく手動実行可能）
-- monthly_order_count リセット関数を探して実行テスト
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%monthly%' OR routine_name LIKE '%order_count%';
```
- 見つかった関数を手動実行してエラーがないか確認
- 重要度: ℹ️Info

### T-05: プランダウングレード関数テスト
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%downgrade%';
```
- 見つかった関数を手動実行してエラーがないか確認
- 重要度: ℹ️Info

### T-06: 品切れタイマー
1. customer-admin画面（顧客管理）から特定商品に品切れタイマー設定（1時間）
2. menu_pattern_items テーブルの `soldout_until` が正しく設定されるか確認
3. EU注文画面で品切れ表示になるか確認
4. **タイマー解除のcron/triggerが存在するか確認**
- 重要度: 🟡Warning

### T-07: 受付一時停止
1. stores テーブルの `delivery_paused_until` の仕組みを確認
2. 一時停止中にEU注文画面がブロックされるか確認
3. 自動再開のcron/triggerが存在するか確認
- 重要度: 🟡Warning

### T-08: クーポン有効期限テスト
```sql
-- 期限切れクーポンが存在するか確認
SELECT * FROM coupons WHERE expires_at < NOW();
```
- 期限切れクーポンがcheckout時に使えないか確認（テストデータ要作成の場合あり）
- 重要度: ℹ️Info

### T-09: ポイント有効期限テスト
```sql
SELECT * FROM point_transactions WHERE expires_at IS NOT NULL;
```
- 期限切れポイントの扱いを確認
- 重要度: ℹ️Info

---

## Phase 7: エラーリカバリーテスト 🟡Warning

### ER-01: confirm-order Edge Function タイムアウトシミュレーション
1. confirm-orderに不正なpayment_intent_idを送信
2. エラーレスポンスの形式を確認（適切なHTTPステータス+エラーメッセージか）
- 期待: 400 or 500 + JSON形式のエラー
- 重要度: 🟡Warning

### ER-02: stripe-create-payment-intent 不正データ送信
1. 金額0円、マイナス金額、文字列金額を送信
2. Edge Functionがバリデーションエラーを返すか
```bash
curl -X POST https://iikwusprydaogzeslgdz.supabase.co/functions/v1/stripe-create-payment-intent \
  -H "Authorization: Bearer [JWT]" \
  -H "Content-Type: application/json" \
  -d '{"amount": 0, "store_id": "test"}'
```
- 期待: 適切なエラーレスポンス
- 重要度: 🟡Warning

### ER-03: Supabase RLS下での不正操作テスト
```bash
# anon keyでordersにINSERT試行
curl -X POST "https://iikwusprydaogzeslgdz.supabase.co/rest/v1/orders" \
  -H "apikey: sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC" \
  -H "Content-Type: application/json" \
  -d '{"total_amount": 1}'
```
- 期待: 403 or RLSエラー（INSERT不可）
- 重要度: 🔴Critical

### ER-04: 二重注文防止確認
1. confirm-orderを同じpayment_intent_idで2回呼んだ場合の挙動
2. 注文が重複作成されないか確認
- 期待: 2回目はエラー or 冪等（同じ結果を返す）
- 重要度: 🔴Critical

---

## Phase 8: 会員機能ギャップテスト ℹ️Info

### G-05: パスワードリセットフロー
1. Supabase Authのパスワードリセット機能が実装されているか確認
2. リセットメール送信の仕組みがあるか確認（コードレベル）
- 未実装の場合: SKIP + TODO記録
- 重要度: ℹ️Info

### G-09: Realtime長時間接続
1. weir-order-dashboard.html を開く
2. Supabase Realtimeの接続設定を確認（reconnect設定、heartbeat等）
3. コード上でreconnectハンドリングがあるか確認
- 重要度: ℹ️Info

### G-10: 受付一時停止中のEU注文ブロック
- T-07と統合して実施
- 重要度: 🟡Warning

---

## 手動テスト（SKIP - テスト手順のみ記録）

以下はCC自動化不可のため、手順のみday3-results.mdに記載してSKIPとする:

| ID | 内容 | 理由 |
|---|---|---|
| G-01 | カード保存→2回目自動入力 | Stripe Elements iframe操作不可 |
| G-02 | ポイント利用注文E2E | カード入力が必要 |
| G-03 | クーポン適用注文E2E | カード入力が必要 |
| G-04 | 退会リクエスト | 機能未実装 |
| G-06 | カート100個→決済 | カード入力が必要（カート追加まではE4-01で実施） |
| G-07 | 2タブ同時注文 | カード入力が必要 |
| G-08 | 通知音テスト | 音声出力の自動確認不可 |
| G-12 | 音声AI E2E | マイク入力不可 |

---

## 完了条件

1. 🔴Critical 全件PASS（FAIL時は修正→再テストまで完了すること）
2. 🟡Warning FAILは原因記録+修正提案（修正可能なら修正）
3. ℹ️Info FAILは記録のみ
4. day3-results.md に全テスト結果をまとめて保存
5. FAILで修正した場合: 変更ファイル一覧と修正内容をday3-results.mdに追記
6. T-01（トラッキング残り時間バグ）は修正まで実施推奨

---

## テスト実行順序（推奨）

1. Phase 1（リグレッション確認）→ 問題あれば即修正
2. Phase 2（3-way照合）→ データ不整合は致命的
3. Phase 7 ER-03, ER-04（セキュリティ系エラーテスト）
4. Phase 3（タイムゾーン）
5. Phase 4（バリデーション）
6. Phase 5（BAN）
7. Phase 6（タイマー）
8. Phase 7 ER-01, ER-02（エラーリカバリー残り）
9. Phase 8（会員機能ギャップ）
