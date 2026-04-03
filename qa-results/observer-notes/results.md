# critical-observer 第3回分析結果 — 2026-03-23

## 修正検証結果

### SEC-4: orders RLSポリシー — FIXED
- 旧: `orders_select_authenticated` が `qual: true`（全認証ユーザーに全注文公開）
- 現: ポリシー削除済み。以下の3ポリシーに置換:
  - `orders_deny_anon_select`: anon → `qual: false`（完全拒否）
  - `orders_select_own`: 自分のmember_idに紐づく注文のみ
  - `orders_by_brand`: staff_accountsのbrand_idに紐づく注文のみ
  - `orders_service_role_all`: service_roleのみ全アクセス
- **リグレッションなし**: anon keyからの注文SELECT遮断、認証ユーザーの自分以外の注文へのアクセス制限を確認

### SEC-5: payments RLSポリシー — FIXED
- 旧: `auth_payments` が `ALL` + `qual: true`（認証ユーザーフルアクセス）
- 現: ポリシー削除済み。以下に置換:
  - `payments_select_by_brand`: スタッフアカウントのブランドに紐づく注文の決済のみ閲覧可
  - `payments_select_own`: 自分の注文の決済のみ閲覧可
  - `payments_service_role_all`: service_roleのみフルアクセス
- **リグレッションなし**

### SEC-6: refunds RLSポリシー — FIXED
- 旧: `auth_refunds` が `ALL` + `qual: true`
- 現: payments同様の適切なポリシーに置換済み
- **リグレッションなし**

### C-08: Stored XSS（ダッシュボード） — FIXED
- `aiden-order-dashboard.html` に `escH()` 関数が実装済み（L579）
- customer_name, phone, 注文ID, 商品名, オプション名など全innerHTML展開箇所でescH()によるサニタイズ確認
- **18箇所以上でescH()適用を確認**

### A-11: サインインハッシュハンドラー — FIXED
- `aiden-order-checkout.html` L2281-2288: `#signin`ハッシュ検知→`openSigninModal()`呼び出し
- DOMContentLoaded待機処理あり
- ESCキー / オーバーレイクリックで閉じる実装あり

### BUG-3: パスワードリセットUX — FIXED
- `aiden-password-reset.html` に成功メッセージ表示要素(`requestSuccess`)が実装済み
- API成功時にメッセージを表示する処理を確認（L176-178）

### CRON-1: google-places-bg-collector — FIXED
- job 8の最新実行が`succeeded`（return_message: "1 row"）
- cronコマンドがハードコードされたservice_role keyを使用するよう修正済み

---

## 未解消の問題

### C-06: orders_public_view PII露出 — STILL OPEN (High)
- VIEWに以下のPIIカラムが残存:
  - `delivery_address`
  - `delivery_lat`
  - `delivery_lng`
  - `member_id`
- VIEWはRLSをバイパスするため、anon keyからアクセス可能なリスクあり

### SEC-7: store_hours RLS無効 — STILL OPEN (Medium)
- `store_hours` テーブルの `rowsecurity: false`
- 営業時間データはpublic情報のため実害は低いが、CLAUDE.mdの「全テーブルでRLS有効化必須」に違反

### SEC-8: RLS有効・ポリシー未設定テーブル — PARTIALLY FIXED (Medium)
- 前回9テーブル → 現在8テーブル（1テーブル修正済み）
- 残存: `alert_history`, `db_metrics`, `edge_function_logs`, `invoice_adjustments`, `monitoring_alerts`, `plan_change_requests`, `sns_connections`, `sns_posts`
- これらのテーブルはRLS有効だがポリシーなし = アクセス全拒否状態（意図的かもしれないが、service_role以外からのアクセスが必要な場合は問題）

### CRON-2 (NEW): collect-competitor-data-weekly 設定不備 — NEW (Medium)
- job 15 が `current_setting('app.settings.service_role_key')` を使用
- `app.settings.service_role_key` は未設定（SELECTでエラー確認済み）
- 次回実行時（日曜18:30 UTC）に確実に失敗する
- job 7, 8, 14はハードコードされたキーで正常動作しているため、job 15も同様の方式に修正すべき

### XSS-2 (NEW): aiden-order-store.html innerHTML未サニタイズ — STILL OPEN (Medium)
- `aiden-order-store.html` に innerHTML 使用箇所が21箇所
- escH() / escapeHtml() は未実装
- 商品名、オプション名、カテゴリ名等がサニタイズなしで展開される
- DBから取得したデータを直接innerHTML展開しているため、Stored XSSリスクあり
- ダッシュボード(C-08)は修正済みだが、消費者向け画面は未対応

---

## 47項目カバレッジ確認

| カテゴリ | 項目数 | R2 PASS | R2 FAIL | R2 SKIP | R3状態 |
|---|---|---|---|---|---|
| A. 注文E2Eフロー | 14 | 4 | 2 | 8 | A-11修正済み。A-03(決済)は未再テスト |
| B. データ連携 | 12 | 8 | 1 | 3 | C-06(PII)未解消 |
| C. バックエンド整合性 | 11 | 7 | 2 | 2 | C-08修正済み。C-06未解消 |
| D. 運用基盤 | 10 | 7 | 3 | 0 | D-01(パスワードリセットUX)修正済み。D-02/03/04はA-11修正でブロック解除の可能性 |

### R3での改善
- **修正確認済み**: SEC-4, SEC-5, SEC-6, C-08, A-11, BUG-3, CRON-1 (計7件)
- **未解消**: C-06, SEC-7, SEC-8 (計3件)
- **新規発見**: CRON-2(competitor-data cron), XSS-2(order-store innerHTML)

### SKIPテスト（19項目）の解除見込み
- A-03修正後: A-06, A-07, A-08, A-09, A-10, B-10, B-11, B-12, C-01, C-02 の10項目が解除可能
- A-11修正済み: A-12, A-13, D-02, D-03, D-04 の5項目が次回テストで実行可能
- 残りSKIP: 4項目（本番データリスク等）

---

## Phase 2 機能検証

### メール認証Phase 2（cleanup-unverified-accounts）
- `cleanup_unverified_accounts()` 関数: 存在確認OK
- cron job 17: 毎日19:00 UTC、active
- 未実行（次回実行待ち）

### 退会Phase 2（process-scheduled-withdrawals）
- `process_scheduled_withdrawals()` 関数: 存在確認OK
- cron job 16: 毎日18:00 UTC、active
- 未実行（次回実行待ち）

---

## POCリリース前 残タスク（優先度順）

### P0（即時修正必須）
- なし（SEC-4/5/6, C-08は修正済み）

### P1（リリース前修正推奨）
1. **C-06**: orders_public_viewからdelivery_address, delivery_lat/lng, member_id除外
2. **A-03**: 決済フロー再テスト（Stripe Connect設定確認）
3. **XSS-2**: aiden-order-store.htmlにescH()実装

### P2（リリース後でも可）
4. SEC-7: store_hours RLS有効化
5. SEC-8: 8テーブルのservice_roleポリシー追加
6. CRON-2: collect-competitor-data cronのキー修正
7. D-02/03/04: 退会フローUIテスト（A-11修正済みなので次回実行可能）

---

## 前回との差分サマリ

| 項目 | R2 | R3 | 変化 |
|---|---|---|---|
| P0セキュリティ問題 | 3件 (SEC-4/5/6) | 0件 | 全修正 |
| Stored XSS | C-08 FAIL | C-08 PASS, XSS-2 NEW | ダッシュボード修正、order-store未対応 |
| サインインフロー | A-11 FAIL | A-11 FIXED | ハッシュハンドラー修正 |
| パスワードリセットUX | BUG-3 OPEN | BUG-3 FIXED | 成功メッセージ実装 |
| google-places cron | CRON-1 FAIL | CRON-1 FIXED | キー修正で正常動作 |
| orders_public_view PII | C-06 FAIL | C-06 STILL OPEN | 未修正 |
| 新規発見 | — | CRON-2, XSS-2 | 2件追加 |
