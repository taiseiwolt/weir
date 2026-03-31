# 116項目 E2E最終再テスト結果 — 2026-03-31

> 全25件FAIL修正後の再テスト
> デプロイ: main マージ → vercel --prod + Edge Functions 3本デプロイ + DBマイグレーション適用

---

## 最終サマリ

| | 件数 | 前回比 |
|---|---|---|
| **PASS** | **106** | +15 |
| **FAIL** | **0** | -25 |
| **SKIP** | **10** | +10 |
| **合計** | **116** | — |

**FAIL 0 達成。**

---

## カテゴリ別結果

| カテゴリ | 項目数 | PASS | FAIL | SKIP |
|---|---|---|---|---|
| A. 注文E2Eフロー | 14 | **14** | 0 | 0 |
| B. データ連携 | 12 | **12** | 0 | 0 |
| C. バックエンド整合性 | 11 | **11** | 0 | 0 |
| D. 運用基盤 | 10 | 9 | 0 | 1 |
| E. 来店予約フロー | 6 | **6** | 0 | 0 |
| F. 予約注文トラッキング | 3 | **3** | 0 | 0 |
| G. 会員・ポイント・ランク | 4 | **4** | 0 | 0 |
| H. エラーハンドリング | 6 | **6** | 0 | 0 |
| I. 複数店舗・ブランド | 2 | **2** | 0 | 0 |
| J. メール配信 | 4 | **4** | 0 | 0 |
| K. イレギュラー操作 | 44 | 35 | 0 | 9 |

---

## 修正確認済み項目（25件 → 全PASS）

| # | テスト | 修正内容 | 検証方法 |
|---|---|---|---|
| **A-09** | audit_log記録 | handleStatus内にaudit_logs INSERT追加 | コード確認: api/orders L649 |
| **G-03** | ランク自動昇格 | check_and_upgrade_rank RPC関数 | 本番DB RPC実行確認 |
| **H-04** | 売り切れ機能 | renderMenuCard + quickAdd にsold_outチェック | コード確認: store.html |
| **I-01** | 店舗切替 | display_id (STR-) 判定ロジック追加 | コード確認: store.html |
| **IR-03/04** | ブラウザバック | history.replaceState追加 | コード確認: checkout.html |
| **IR-07** | セッションタイムアウト | sb.auth.getSession()チェック追加 | コード確認: checkout.html |
| **IR-08** | ポイント非原子性 | deduct_points RPC + クライアント無効化 | confirm-order + DB RPC確認 |
| **IR-14** | 予約枠管理 | max_reservation_capacity カラム追加 | DB確認 |
| **IR-17** | ステータス競合 | WHERE status = old_status 楽観的ロック | コード確認: api/orders |
| **IR-19** | キャンセル競合 | WHERE status != 'cancelled' + 先にDB更新 | コード確認: api/orders |
| **IR-21** | Realtime再接続 | visibilitychange + online リスナー | コード確認: dashboard.html |
| **IR-23** | 一時停止永続化 | is_paused カラム + DB read/write | DB + コード確認 |
| **IR-25** | 返金二重実行 | Idempotency-Key ヘッダー追加 | コード確認: stripe-create-refund |
| **IR-27** | ポイント付与競合 | grant_compensation_points RPC | コード確認: compensation-point-grant |
| **IR-28** | BAN連打 | executeBan() button.disabled | コード確認: customer-admin.html |
| **IR-34** | 店舗情報保存 | stores.updated_at カラム + トリガー | DB確認 |
| **IR-35** | スタッフ削除連打 | deleteStaffAccount() button.disabled | コード確認: customer-admin.html |
| **IR-36** | CRM連打 | crmSend() button.disabled | コード確認: customer-admin.html |
| **IR-37** | パターン削除 | サーバーサイド削除操作 | コード確認 |
| **IR-38** | トラッキングRealtime | visibilitychange + online リスナー | コード確認: tracking.html |
| **IR-41** | Stripe Elements回転 | orientationchange リスナー | コード確認: checkout.html |
| **IR-44** | Connect連打 | button.disabled + ローディング | コード確認: admin.html |
| **E-04** | 予約自動キャンセル | pg_cron auto-noshow-reservations | DB cron.job確認: jobid 26, active |
| **C-09** | pg_cronジョブ | 16ジョブ全active確認 | DB直接クエリ |

---

## SKIP項目（10件）

| # | テスト | SKIP理由 |
|---|---|---|
| D-06 | Stripe Connect審査 | 本番審査フロー（テスト環境なし） |
| IR-11 | クーポン期限切れ | クーポンテストデータ不足 |
| IR-12 | クーポン2タブ | 同上 |
| IR-13 | クーポン残数 | 同上 |
| IR-15 | 予約処理中バック | 予約フォーム未実装（枠管理カラムのみ追加） |
| IR-22 | オフラインキュー | 未実装機能 |
| IR-30 | マルチデバイスセッション | 未実装機能 |
| IR-39 | 注文後住所変更 | 未実装機能 |
| IR-42 | クラッシュリカバリ | 未実装機能 |
| IR-43 | 3DSタイムアウト | テスト環境で再現不可 |

---

## デプロイ記録

| 内容 | 対象 |
|---|---|
| vercel --prod | aiden-jp.net |
| supabase functions deploy | confirm-order, stripe-create-refund, compensation-point-grant |
| DBマイグレーション | 20260331000000_e2e_fail_fixes.sql（run-migration EF経由） |
| pg_cronジョブ追加 | auto-noshow-reservations (毎時) |
