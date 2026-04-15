# 管理画面間データ整合性レポート

## 調査日: 2026-03-18
## 対象ファイル
- `aiden-admin.html` (Weir管理マスタ)
- `aiden-customer-admin.html` (顧客管理画面)
- `aiden-order-dashboard.html` (受注ダッシュボード)
- `aiden-order-checkout.html` (チェックアウト)
- `api/orders/[...path].js` (注文API)
- `supabase/functions/` (Edge Functions)

---

## 修正済み (自動修正)

### 1. aiden-admin.html: 注文取得上限 500→2000
- **重要度:** 🟡 Warning
- **問題:** `.limit(500)` で注文が500件を超えるとデータ切り捨て → 店舗別売上集計に影響
- **修正:** `.limit(2000)` に変更 (行 247)

### 2. aiden-admin.html: 会員名の表示順序を日本語順に統一
- **重要度:** 🟡 Warning
- **問題:** `first_name + ' ' + last_name` (欧米順) → customer-admin は `last_name + first_name` (日本語順)
- **修正:** `last_name + ' ' + first_name` に変更 (行 200)

### 3. aiden-customer-admin.html: 会員ランク表示のバグ修正
- **重要度:** 🔴 Critical
- **問題:** `m.rank` (存在しないカラム) を読んでおり、全会員が常に「レギュラー」表示
- **原因:** members テーブルには `rank` カラムは無く `current_rank_id` (UUID FK→rank_settings) が正しい参照先
- **修正:** `rank_settings` をロード → `current_rank_id` でランクマップ参照 (admin.html と同じロジック) (行 4864-4877)

### 4. aiden-customer-admin.html: 会員ポイント表示のバグ修正
- **重要度:** 🔴 Critical
- **問題:** `m.point_balance` (存在しないカラム) を読んでおり、全会員のポイントが常に0表示
- **原因:** members テーブルに `point_balance` カラムは無い。admin.html は `point_transactions` を集計して算出
- **修正:** `point_transactions` テーブルから `member_id, amount` を取得し集計 (admin.html と同じロジック) (行 4884-4893)

### 5. aiden-order-dashboard.html: ステータスマッピング不一致修正
- **重要度:** 🔴 Critical
- **問題1:** API が `order_placed` ステータスで注文を作成するが、Dashboard の `mapOrderStatus` が `order_placed` を認識せず → 新規注文が表示されない
- **問題2:** Dashboard → API のステータス更新で `confirmed` を送信するが、API の有効値は `accepted` → ステータス更新が400エラーで失敗
- **問題3:** API の `completed` ステータスが `done` にマッピングされない
- **修正:**
  - `mapOrderStatus`: `order_placed` → `new`, `accepted` → `cooking`, `completed` → `done` を追加
  - `STATUS_NEXT_API`: `new:'confirmed'` → `new:'accepted'` に変更

---

## 発見された構造的問題

### A. 注文作成のデュアルパス問題
- **重要度:** 🟡 Warning
- **状況:**
  - **API パス** (`POST /api/orders`): サーバーサイドで価格計算→Stripe PI作成→ordersテーブルINSERT→order_items INSERT (正しいフロー)
  - **Edge Function パス** (`stripe-create-payment-intent`): Stripe PI のみ作成、ordersテーブルへの書き込みなし
  - `aiden-order-checkout.html` は Edge Function パスを使用しており、orders テーブルへの INSERT が見つからない
- **リスク:** チェックアウトで作成された注文がDBに保存されない可能性がある

### B. members 集計値のクライアントサイド更新
- **重要度:** 🟡 Warning
- **状況:**
  - `members.total_spend` と `monthly_order_count` は checkout.html のクライアントJSで更新 (行 2080-2083)
  - DBトリガーによる自動更新は存在しない
  - ブラウザが途中で閉じた場合、データが永続的に不整合になる
- **影響:** customer-admin の売上分析、ランク判定に影響

### C. point_transactions.order_id が NULL
- **重要度:** 🟡 Warning
- **状況:** checkout.html が point_transactions に INSERT する際、`order_id: null` を設定 (行 2023-2030, 2057-2066)
- **原因:** クライアントサイドでは注文IDが利用できない (Edge Function からの戻り値にorder_idが含まれない)
- **影響:** ポイント消費/獲得と注文のトレーサビリティが失われる

### D. admin.html のメニューデータがハードコード
- **重要度:** 🔵 Info (既知の制限)
- **状況:** admin.html のメニューは11品の静的配列 (行 128)、customer-admin.html は products/categories/option_groups 等を Supabase から取得
- **結果:** customer-admin でメニュー変更しても admin には反映されない

### E. RLS ポリシーの注意事項
- **重要度:** 🔵 Info
- **状況:**
  - `orders` テーブルの anon SELECT ポリシーが `USING (true)` (全件参照可能)
  - admin.html は anon key で members を SELECT しているが、RLS で `auth.uid() = auth_user_id` のため、データが返らない可能性あり
  - admin.html はフォールバックとしてハードコードデモデータを使用

---

## テーブル参照マトリクス

| テーブル | admin | customer-admin | dashboard | checkout | API |
|---------|-------|---------------|-----------|----------|-----|
| `corps` | SELECT | SELECT | - | SELECT | - |
| `brands` | SELECT | SELECT | - | SELECT(join) | SELECT |
| `stores` | SELECT | SELECT | SELECT | SELECT | SELECT |
| `accounts` | CRUD | - | - | - | - |
| `staff_accounts` | - | CRUD | - | - | - |
| `members` | SELECT | SELECT | - | SELECT/UPDATE | SELECT/INSERT/UPDATE |
| `rank_settings` | SELECT | CRUD | - | SELECT | - |
| `orders` | SELECT | - | SELECT/Realtime | - | CRUD |
| `order_items` | SELECT(join) | - | SELECT(join) | - | INSERT/SELECT |
| `point_transactions` | SELECT/INSERT | SELECT(修正後) | - | INSERT | - |
| `products` | - | SELECT | SELECT | - | SELECT |
| `categories` | - | SELECT | SELECT | - | SELECT |
| `invoices` | SELECT/UPDATE | SELECT | - | - | - |
| `guest_order_summaries` | SELECT | SELECT | - | - | - |
| `service_subscriptions` | SELECT | SELECT | - | - | - |

---

## Playwright テスト

`e2e-data-consistency.spec.js` に以下のテストを作成済み:

1. **1-1:** 店舗データの一致 (admin vs Supabase)
2. **1-2:** 会員データ件数の一致
3. **1-3:** 会員ランク表示方式の確認
4. **1-4:** 会員ポイント (point_transactions 集計 vs 表示値)
5. **2-1:** Dashboard ステータスマッピング検証
6. **2-2:** Dashboard→API ステータス値の有効性
7. **2-3:** Admin 注文件数 vs Supabase
8. **3-1:** Checkout Edge Function 参照確認
9. **3-2:** Dashboard リアルタイム購読確認
10. **3-3:** point_transactions の order_id 確認
11. **4-1:** guest_order_summaries ビュー確認
12. **4-2:** orders.store_id 外部キー整合性
13. **4-3:** members.total_spend と orders 実績の一致
14. **5-1:** API 注文データ取得
15. **5-2:** API ステータス値有効性
16. **5-3:** Menu API と DB の整合性

実行コマンド:
```bash
npx playwright test e2e-data-consistency.spec.js --reporter=list
```
