# Auto-Tester R3 Results

**Date**: 2026-03-23
**Tester**: auto-tester
**Round**: R3 (Regression)

---

## Summary

| Result | Count |
|--------|-------|
| PASS   | 12    |
| FAIL   | 1     |
| SKIP   | 4     |
| Total  | 17    |

---

## C-01~C-04: Amount Verification (Stripe)

| ID   | Test                          | Result | Notes |
|------|-------------------------------|--------|-------|
| C-01 | order.total_amount = SUM(items) | SKIP | No Stripe-linked payments in DB (stripe_payment_intent_id is NULL for all) |
| C-02 | payment.amount = order.total_amount | SKIP | Same as above |
| C-03 | Commission rate correct       | SKIP | Same as above |
| C-04 | application_fee_amount match  | SKIP | Same as above |

**Note**: 107 orders exist but none have Stripe payment records. Amount verification requires live Stripe integration.

---

## C-05: RLS Anon Key - Orders Empty Array

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-05 | anon key SELECT on orders → [] | **PASS** | Returns `[]`. `orders_deny_anon_select` policy blocks with `qual: false` for role `anon` |

---

## C-06: orders_public_view PII Check

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-06 | orders_public_view contains no PII | **FAIL** | PII columns still present |

**FAIL Details**: The following PII/sensitive columns remain in `orders_public_view`:
- `delivery_address` — customer physical address
- `delivery_lat` — GPS latitude
- `delivery_lng` — GPS longitude
- `member_id` — links to member identity

**Previous**: R2 flagged `delivery_address`. R3 confirms **unfixed** and additionally finds `delivery_lat`, `delivery_lng`, `member_id`.

**Fix**: ALTER VIEW to exclude these 4 columns, or replace with masked versions for operational needs.

---

## C-07: confirm-order JWT Auth

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-07 | POST confirm-order without JWT → 401 | **PASS** | HTTP 401 returned correctly |

---

## C-08: XSS Sanitization (escH)

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-08a | escH() function exists in order-dashboard | **PASS** | Escapes `& < > " '` — 5 entity replacements |
| C-08b | escH() used in rowHtml() render | **PASS** | o.id, item names, timestamps, customer name, phone all escaped |
| C-08c | escH() used in detail popup | **PASS** | Customer name, phone, item names, options all escaped |
| C-08d | escH() used in notification popup | **PASS** | o.id, channel, item names escaped |
| C-08e | escH() used in history/menu renders | **PASS** | Item names, categories, product names escaped |
| C-08f | escHtml() exists in order-tracking | **PASS** | Chat messages escaped via escHtml() |

**Minor Note**: Cancel functions (lines 875, 886, 888, 895) use `o.id` and `it.n` without escH. However these are populated from internal demo data (numeric counter / hardcoded menu), not user-supplied input. Low risk but ideally should also be escaped for defense-in-depth.

---

## C-09: pg_cron Jobs Active

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-09 | pg_cron jobs exist and are active | **PASS** | 13 active cron jobs confirmed |

Active jobs:
1. `aiden_auto_status_switch` — every minute
2. `aiden_record_db_metrics` — hourly
3. `aiden_cleanup_old_metrics` — daily 04:00 UTC
4. `monthly-order-count-reset` — 1st of month
5. `google-reviews-collector-weekly` — weekly Sun 18:00 UTC
6. `google-places-bg-collector-daily` — daily 19:00 UTC
7. `process-plan-downgrades` — daily 15:30 UTC
8. `aiden_auto_status_update` — every 5 min
9. `aiden_cleanup_status_change_log` — daily 05:00 UTC
10. `monitor-usage-hourly` — hourly
11. `collect-competitor-data-weekly` — weekly Sun 18:30 UTC
12. `process-scheduled-withdrawals` — daily 18:00 UTC
13. `cleanup-unverified-accounts` — daily 19:00 UTC

---

## C-10: Monitor-Usage Cron

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-10 | monitor-usage-hourly cron active | **PASS** | Schedule: `0 * * * *` (hourly), active: true |

---

## C-11: Business Hours

| ID   | Test | Result | Notes |
|------|------|--------|-------|
| C-11 | Store hours data for today (Monday JST) | **PASS** | Verified stores have hours for day_of_week=1 (Mon), open 11:00-22:00, is_closed=false |

---

## SEC-4: Orders SELECT Blocked (Fix Verification)

| ID    | Test | Result | Notes |
|-------|------|--------|-------|
| SEC-4 | anon key SELECT orders → [] | **PASS** | `orders_select_authenticated` removed. Now: `orders_deny_anon_select` (anon→false), `orders_select_own` (auth→own member orders only), `orders_by_brand` (staff by brand) |

---

## SEC-5: Payments SELECT Blocked (Fix Verification)

| ID    | Test | Result | Notes |
|-------|------|--------|-------|
| SEC-5 | anon key SELECT payments → [] | **PASS** | `auth_payments` removed. Now: `payments_select_own` (auth→own orders), `payments_select_by_brand` (staff by brand), `payments_service_role_all` |

---

## SEC-6: Refunds SELECT Blocked (Fix Verification)

| ID    | Test | Result | Notes |
|-------|------|--------|-------|
| SEC-6 | anon key SELECT refunds → [] | **PASS** | `auth_refunds` removed. Now: `refunds_select_own` (auth→own orders), `refunds_select_by_brand` (staff by brand), `refunds_service_role_all` |

---

## Open Issues

### FAIL: C-06 — orders_public_view PII Exposure (carried from R2)
- **Severity**: HIGH
- **Status**: UNFIXED since R2
- **Columns**: `delivery_address`, `delivery_lat`, `delivery_lng`, `member_id`
- **Impact**: Any authenticated user can potentially see customer delivery addresses and GPS coordinates via this view
- **Recommended Fix**: `CREATE OR REPLACE VIEW orders_public_view AS SELECT ... (exclude PII columns)`

### Minor: Cancel function innerHTML without escH
- **Severity**: LOW
- **Files**: `aiden-order-dashboard.html` lines 875, 886, 888, 895
- **Impact**: Internal demo data only; no user-supplied input reaches these paths currently
- **Recommended**: Add escH() for defense-in-depth
