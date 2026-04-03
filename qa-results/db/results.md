# DB Verifier - Round 3 Results

**Date:** 2026-03-23
**Tester:** db-verifier
**Focus:** RLS修正確認、金額照合、退会バッチ、Cron

---

## RLS修正確認（最重要）

### SEC-4: orders_select_authenticated 削除確認
- **Result: PASS**
- `pg_policies` で orders テーブルのポリシーを確認。`orders_select_authenticated` は存在しない
- 現在のordersポリシー:
  - `orders_anon_insert` (INSERT, public)
  - `orders_by_brand` (ALL, staff_accounts.brand_id ベース)
  - `orders_deny_anon_select` (SELECT, anon → `false`)
  - `orders_select_own` (SELECT, members.auth_user_id ベース)
  - `orders_service_role_all` (ALL, service_role)

### SEC-5: auth_payments → 3ポリシー置換確認
- **Result: PASS**
- `auth_payments` は存在しない
- 新ポリシー3つを確認:
  - `payments_select_own` (SELECT, authenticated, member自身の注文経由)
  - `payments_select_by_brand` (SELECT, authenticated, staff_accounts.brand_id 経由)
  - `payments_service_role_all` (ALL, service_role)

### SEC-6: auth_refunds → 3ポリシー置換確認
- **Result: PASS**
- `auth_refunds` は存在しない
- 新ポリシー3つを確認:
  - `refunds_select_own` (SELECT, authenticated, member自身の注文経由)
  - `refunds_select_by_brand` (SELECT, authenticated, staff_accounts.brand_id 経由)
  - `refunds_service_role_all` (ALL, service_role)

---

## セキュリティ

### C-05: anon key で orders アクセス → RLS で空配列
- **Result: PASS**
- anon key で `GET /rest/v1/orders` → `[]` (空配列)
- `orders_deny_anon_select` ポリシー (`qual: false`) が正常動作

### C-06: orders_public_view に PII 非含有
- **Result: PASS (WARNING あり)**
- customer_name, customer_email, customer_phone は **含まれない** (PASS)
- ただし `delivery_address` が含まれる（配送先住所 = semi-PII）
- **WARNING:** delivery_address は配送注文で必要だが、public view に露出している点は要検討

### B-09: ゲスト PII 保護
- **Result: PASS**
- `guests` テーブル（name, email, phone 含む）: RLS有効、`guests_service_role_all` のみ（service_role以外アクセス不可）
- `guest_order_summaries` ビュー: `guest_identifier`（匿名化済み）, order_count, total_amount, last_order_at のみ → PII なし
- orders テーブルの customer_name/email/phone は RLS + `orders_deny_anon_select` で保護済み
- anon key で guest_pii テーブルアクセス → テーブル自体が存在しない（PGRST205）= 安全

---

## 金額照合

### C-01~C-04: 手数料・3-way照合
- **Result: SKIP (一部 INFO)**
- Stripe未連携のため3-way照合（orders ↔ payments ↔ Stripe）は実施不可
- payments テーブルに紐づくレコード: 0件（LEFT JOIN結果が空）
- application_fee_amount: ほぼ全件 0（seed/テストデータのため）
  - delivery: 46件中 43件が fee=0、3件のみ fee設定あり
  - dinein: 28件すべて fee=0
  - pickup: 33件すべて fee=0
- **INFO:** order_type の値は `dinein` / `pickup` / `delivery`（`dine_in` ではない）
- **INFO:** Stripe連携後に再テスト必要

---

## Cron

### C-09: pg_cron ジョブ一覧確認
- **Result: PASS**
- 13ジョブが active で登録済み:
  | jobid | jobname | schedule | active |
  |-------|---------|----------|--------|
  | 3 | aiden_auto_status_switch | * * * * * | true |
  | 4 | aiden_record_db_metrics | 0 * * * * | true |
  | 5 | aiden_cleanup_old_metrics | 0 4 * * * | true |
  | 6 | monthly-order-count-reset | 0 0 1 * * | true |
  | 7 | google-reviews-collector-weekly | 0 18 * * 0 | true |
  | 8 | google-places-bg-collector-daily | 0 19 * * * | true |
  | 10 | process-plan-downgrades | 30 15 * * * | true |
  | 12 | aiden_auto_status_update | */5 * * * * | true |
  | 13 | aiden_cleanup_status_change_log | 0 5 * * * | true |
  | 14 | monitor-usage-hourly | 0 * * * * | true |
  | 15 | collect-competitor-data-weekly | 30 18 * * 0 | true |
  | 16 | process-scheduled-withdrawals | 0 18 * * * | true |
  | 17 | cleanup-unverified-accounts | 0 19 * * * | true |

### C-10: pg_cron 実行ログ確認
- **Result: PASS**
- 直近の実行ログすべて `status: succeeded`
- aiden_auto_status_switch: 毎分実行、正常
- aiden_record_db_metrics: 毎時実行、正常
- monitor-usage-hourly: 毎時実行、正常
- aiden_auto_status_update: 5分毎実行、正常

---

## 退会予約バッチ

### W-01: process_scheduled_withdrawals() テスト
- **Result: PASS**
- テストデータ（`_test_withdraw_01`）を作成し、pending状態 + 過去のscheduled_at を設定
- ポイント500ptを付与後、`process_scheduled_withdrawals()` を実行
- 結果:
  - withdrawal_status: `pending` → `withdrawn` (正常遷移)
  - withdrawal_completed_at: 設定された
  - ポイント: 失効処理実行
  - audit_logs: 記録された
- テストデータはすべてクリーンアップ済み

### W-02: 退会cronジョブ設定確認
- **Result: PASS**
- jobname: `process-scheduled-withdrawals`
- schedule: `0 18 * * *` (UTC 18:00 = JST 03:00 毎日)
- active: true

---

## サマリ

| ID | テスト項目 | Result |
|----|-----------|--------|
| SEC-4 | orders_select_authenticated 削除 | **PASS** |
| SEC-5 | payments ポリシー3分割 | **PASS** |
| SEC-6 | refunds ポリシー3分割 | **PASS** |
| C-05 | anon orders → 空配列 | **PASS** |
| C-06 | orders_public_view PII非含有 | **PASS** (WARNING: delivery_address) |
| B-09 | ゲストPII保護 | **PASS** |
| C-01~04 | 金額3-way照合 | **SKIP** (Stripe未連携) |
| C-09 | pg_cron ジョブ一覧 | **PASS** |
| C-10 | pg_cron 実行ログ | **PASS** |
| W-01 | 退会バッチ関数テスト | **PASS** |
| W-02 | 退会cronジョブ設定 | **PASS** |

**総合: 9 PASS / 1 SKIP / 0 FAIL**

### 要対応事項
1. **C-06 WARNING:** `orders_public_view` に `delivery_address` が含まれている。配送先住所はsemi-PIIのため、viewから除外するか検討が必要
2. **C-01~04:** Stripe連携後に3-way金額照合を再テストする必要あり
