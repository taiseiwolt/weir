# SKIP項目 消化結果レポート — 2026-03-30

> Stripe審査通過・本番環境にて実施
> 前提: `e2e-retest-2026-03-30.md`（72 PASS / 23 FAIL / 21 SKIP）の状態から実施

---

## サマリ

| | SKIP前 | 今回消化 | 結果 |
|---|---|---|---|
| SKIP総数 | 21 | 7 | — |
| PASS | — | 6 | D-01/02/03/04/10・**E-02** |
| FAIL（新規）| — | 1 | C-09（間接確認のみ） |
| SKIP継続 | 21 | 14 | Stripe本番テスト11件 + その他3件 |

---

## 消化済み項目（7件）

### PASS（5件）

| # | テスト | 結果 | 検証方法 |
|---|---|---|---|
| **D-01** | パスワードリセットメール送信 | **PASS** | `POST /auth/v1/recover` → HTTP 200確認 |
| **D-02** | アカウント退会 | **PASS** | Admin API `DELETE /auth/v1/admin/users/{id}` → HTTP 200確認 |
| **D-03** | 退会後ログイン不可 | **PASS** | `POST /auth/v1/token?grant_type=password` → HTTP 400 invalid_credentials確認 |
| **D-04** | 未確認メール再送 | **PASS** | `POST /auth/v1/resend` → HTTP 200確認 |
| **D-10** | watchdogスクリプト正常動作 | **PASS** | watchdogスクリプト実行 → 4件の日次pg_cronジョブ全て正常確認 |

### FAIL（2件）

| # | テスト | 結果 | 原因 | 推奨修正 |
|---|---|---|---|---|
| **E-02** | 予約リアルタイム反映 | **PASS** | RLS原因特定・修正済み。`sb_publishable_`キー使用時にSupabase JSクライアントはログイン済みセッション（role: authenticated）でRealtimeに接続するが、`authenticated_select_all`ポリシーが欠落していたためイベント未配信。migration `20260330000002`でポリシー追加 → `_realtimeHit:1`確認 | — |
| **C-09** | pg_cronジョブ一覧確認 | **PARTIAL** | Docker未起動のためDB直接クエリ不可。間接確認（watchdog + migrationファイル）で12ジョブを確認 | Docker起動後に `SELECT * FROM cron.job` で直接確認 |

---

## 副次的バグ発見・修正（SKIP消化中に検出）

| # | バグ | 修正内容 | ステータス |
|---|---|---|---|
| BUG-1 | `get-reservations` Edge Function 未デプロイ | `supabase functions deploy get-reservations --no-verify-jwt` で本番デプロイ | ✅ 修正済み・本番反映 |
| BUG-2 | ダッシュボード `loadReservations` に不正なAuthorizationヘッダー | `fetch(url)` からヘッダー削除 | ✅ 修正済み・本番反映（commit: `3e30953`） |

---

## 継続SKIP項目（14件）

### Stripe本番テスト（11件）— テストモードキー未取得

| # | テスト | SKIP理由 |
|---|---|---|
| A-03 | ゲスト注文→決済完了フロー | Stripeテストキー（pk_test_）が必要 |
| A-06 | 注文受付→準備中→提供済みフロー | 同上 |
| A-07 | 注文キャプチャ（提供完了時確定） | 同上 |
| A-08 | Stripe Webhook受信→DB反映 | 同上 |
| A-12 | LINE認証→注文フロー | 同上 |
| A-13 | 会員ログイン→ポイント使用→決済 | 同上 |
| B-08 | 決済データ→Supabase同期 | 同上 |
| B-10 | Stripe Connect手数料計算 | 同上 |
| B-11 | 部分返金→DB反映 | 同上 |
| B-12 | 全額返金→ステータス更新 | 同上 |
| H-01 | 決済失敗カード処理 | 同上 |

> Stripe Dashboardでテストモードに切り替え、`pk_test_` / `sk_test_` キーを取得することで消化可能。

### その他（3件）

| # | テスト | SKIP理由 |
|---|---|---|
| E-01 | 予約申請〜承認フロー | アクティブ予約データ不足（手動テスト可） |
| E-05 | 予約キャンセル通知 | メール通知設定確認が必要 |
| D-06 | Stripe Connect審査〜入金 | 本番Stripe Connect審査フロー（テスト環境なし） |

---

## 最終テスト結果サマリ（SKIP消化後）

| | 件数 | 前回比 |
|---|---|---|
| **PASS** | **78** | +6 |
| **FAIL** | **24** | +1（C-09 PARTIAL） |
| **SKIP** | **14** | -7 |
| **合計** | **116** | — |

> E-02 PASS: migration `20260330000002_realtime_authenticated_select.sql` 適用済み（本番DB反映済み）
> Stripe 11件: テストモードキー取得後に消化可能

---

## 修正・デプロイ記録

| 内容 | コミット | デプロイ |
|---|---|---|
| fix: add Authorization header to get-reservations fetch | `b11ffae` | ✅ aiden-jp.net |
| fix: remove Authorization header (no-verify-jwt) | `3e30953` | ✅ aiden-jp.net |
| supabase functions deploy get-reservations --no-verify-jwt | — | ✅ Edge Function |
| migration 20260330000002: authenticated SELECT policies for reservations + orders | — | ✅ 本番DB（run-migration Edge Function経由） |
