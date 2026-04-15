# 決済セキュリティテスター（Payment Security Tester）セキュリティテストレポート

**実行日**: 2026-04-08
**対象リポジトリ**: github.com/taiseiwolt/aiden-demo + github.com/taiseiwolt/aiden-pos
**対象コミット**: dfc961121447fdd0c593b6f269cead14e20df1a2

## サマリ
- チェック項目数: 38
- 問題なし: 22
- 要改善（P2/P3）: 8
- 脆弱性あり（P0/P1）: 8

---

## 決済フロー概要

Weirには2つの並行決済フローが存在:

1. **新フロー（主要）**: フロントエンド → Edge Function `stripe-create-payment-intent`（サーバーサイド価格再計算）→ Stripe Elements確認 → `confirm-order` Edge Function（PI検証）→ 注文レコード作成
2. **レガシーフロー**: フロントエンド → Vercel API `POST /api/orders`（サーバーサイド価格検索）→ PI + 注文同時作成 → 別途`handleConfirm`でポイント・メール処理

両フローとも `capture_method: 'manual'`（注文時与信）を使用。

---

## 発見事項

### P0/P1（即時対応）

#### P0-1: レガシーフローがフロントエンドからstripe_account_idを受け入れ
- **対象**: `api/orders/[...path].js` lines 76, 199-202
- **内容**: レガシー`handleCreate`がリクエストボディから`stripe_account_id`を直接受け取り、`transfer_data.destination`に渡す。攻撃者が自身のStripe Connectアカウントを指定すると、売上が攻撃者のアカウントに転送される。
- **再現手順**: `POST /api/orders` に有効なカートデータと `stripe_account_id: "acct_attacker123"` を送信
- **影響**: 売上の不正転送（金銭被害）
- **修正方針**: `stripe_account_id`をリクエストから受け取らず、DBから`corps`テーブル経由で取得する（新フローでは既に修正済み）
- **フェーズ影響**: Phase 1

#### P0-2: handleConfirmエンドポイントに認証なし
- **対象**: `api/orders/[...path].js` lines 266-436
- **内容**: `handleConfirm`関数が`requireAuth`や`authenticateRequest`を呼び出していない。注文IDを知る者が認証なしでポイント消費・付与・ランク更新・メール送信をトリガー可能。`point_settings`、`member_rank_multi`、`user_points`がリクエストボディから直接信頼される。
- **再現手順**: `POST /api/orders/{id}/confirm` に`point_settings: { earn_rate_point: 99999 }`を送信
- **影響**: 無制限のポイント付与、ランク操作
- **修正方針**: 認証を追加し、point_settings等をDBから取得する
- **フェーズ影響**: Phase 1

#### P0-3: レガシー金額直接フローにサーバーサイド価格検証なし
- **対象**: `supabase/functions/stripe-create-payment-intent/index.ts` lines 495-552
- **内容**: 後方互換コードパスが`amount`をクライアントから直接受け取り、DB価格との照合なし。さらに`application_fee_amount`と`stripe_account_id`もクライアントから受け取る。
- **影響**: 金額改ざん + 決済先ハイジャック
- **修正方針**: レガシーパスを削除するか、サーバーサイドでの価格再計算を必須にする
- **フェーズ影響**: Phase 1

#### P1-1: 数量バリデーションなし（ゼロ、負数、巨大数）
- **対象**: `api/orders/[...path].js` line 146, `supabase/functions/stripe-create-payment-intent/index.ts` line 237
- **内容**: どちらのエンドポイントも数量が正の整数かつ合理的な範囲内であることを検証しない。負数は組み合わせ次第で合計金額を減少させる可能性。
- **修正方針**: `quantity > 0 && quantity <= 100 && Number.isInteger(quantity)` のバリデーション追加
- **フェーズ影響**: Phase 1

#### P1-2: confirm-order Edge Functionが設計上非認証
- **対象**: `supabase/functions/confirm-order/index.ts` line 32
- **内容**: Stripe PI検証が認証の代替とコメントされているが、PI IDの推測・傍受が可能。冪等性チェックで重複注文は防止されるが、client_secretがフロントエンドレスポンスに露出。
- **緩和要因**: 冪等性チェック + Stripe PI statusの`succeeded`/`requires_capture`検証
- **フェーズ影響**: Phase 1

#### P1-3: 返金エンドポイントに金額上限バリデーションなし
- **対象**: `supabase/functions/stripe-create-refund/index.ts` lines 41-48
- **内容**: 返金金額がStripeに直接渡され、注文の`total_amount`との照合なし。90日制限や店舗設定の返金期間もサーバーサイドで未強制。管理UIでのチェックは直接API呼び出しでバイパス可能。
- **修正方針**: 注文のtotal_amountとの照合 + 90日/店舗設定の期間チェックを追加
- **フェーズ影響**: Phase 1

#### P1-4: 返金Edge Functionにaudit_log記録なし
- **対象**: `supabase/functions/stripe-create-refund/index.ts`
- **内容**: 返金操作がaudit_logsに記録されない。注文テーブルの`refunded_by`フィールドのみ。
- **修正方針**: audit_logsへの書き込みを追加
- **フェーズ影響**: Phase 1

#### P1-5: Confirmエンドポイントがクライアント提供のポイント設定を信頼
- **対象**: `api/orders/[...path].js` lines 270-277, 308-315
- **内容**: `point_settings`, `member_rank_multi`, `user_points`をリクエストボディから取得し直接使用。
- **修正方針**: DBから取得する
- **フェーズ影響**: Phase 1

---

### P2/P3（計画的対応）

#### P2-1: レガシー注文作成に冪等性キーなし
- **対象**: `api/orders/[...path].js` line 204
- **内容**: `stripe.paymentIntents.create()`に冪等性キーなし。ネットワークタイムアウト+リトライで二重課金の可能性。
- **フェーズ影響**: Phase 1

#### P2-2: captureが「prepared」ステータスで実行（「delivered」ではない）
- **対象**: `api/orders/[...path].js` line 625
- **内容**: ビジネス要件は「提供完了時にcapture」だが、「prepared」で実行される。顧客が商品を受け取る前に決済確定。
- **フェーズ影響**: Phase 1

#### P2-3: Edge Functionのオプション価格検証が不完全
- **対象**: `supabase/functions/stripe-create-payment-intent/index.ts` lines 210-225
- **内容**: `unitPrice >= minBasePrice`のみチェック。高額トッピング込みの正確な価格を独立計算していない。
- **フェーズ影響**: Phase 1

#### P2-4: キャンセル操作にaudit_logなし
- **対象**: `api/orders/[...path].js` lines 573-585
- **内容**: Stripe返金実行時にaudit_logsへの書き込みなし
- **フェーズ影響**: Phase 1

#### P2-5: 孤立注文クリーンアップがorder_itemsを永久削除
- **対象**: `supabase/migrations/20260324000000_cleanup_orphan_orders_cron.sql` line 16
- **内容**: 不正調査やデバッグに有用なデータが永久削除される
- **修正方針**: ソフトデリートまたはアーカイブに変更
- **フェーズ影響**: Phase 1

#### P3-1: service_role JWT検証の弱点
- **対象**: `supabase/functions/_shared/auth.ts` lines 90-99
- **内容**: JWTフォールバックがatobでペイロード解析のみ（署名検証なし）
- **フェーズ影響**: Phase 2

#### P3-2: Stripeエラーメッセージのクライアント転送
- **対象**: 複数Edge Functions
- **内容**: stripeErr.error?.messageを直接レスポンスに含む
- **フェーズ影響**: Phase 2

#### P3-3: stripe-create-payment-intentの認証スキップ
- **対象**: `supabase/functions/stripe-create-payment-intent/index.ts` line 77
- **内容**: ゲストチェックアウトのため設計上非認証。任意の店舗に対してPI作成可能。
- **フェーズ影響**: Phase 1

---

## 手数料計算検証

### 新フロー（Edge Function）
- **割引前計算**: 確認済。`applicationFee = Math.round(subtotal * feeRate)` で`subtotal`は割引前合計
- **動的レート**: `fee_schedules`テーブルからオーバーライド対応。フォールバック: dinein 3.8%, takeout 4.0%, delivery 4.0% — 正確
- **端数処理**: `Math.round()`使用（CLAUDE.md仕様はfloor）。差は最大1円だが、仕様との乖離あり

### レガシーフロー（Vercel API）
- **レート**: ハードコード `{ takeout: 0.040, dinein: 0.038, delivery: 0.040 }` — 正確
- **fee_schedules未参照**: カスタムレートが無視される

---

### 問題なし
| 項目 | 確認結果 |
|------|---------|
| Webhook署名検証 | constructEvent()適切に実装 |
| capture_method: 'manual' | 両フローで設定 |
| 新フローのサーバーサイド価格再計算 | product_sizesテーブルから取得、売切チェック含む |
| クーポンのサーバーサイド検証 | DB照合、使用制限チェック |
| ポイント残高のサーバーサイドチェック | point_transactionsテーブルから計算 |
| 営業時間チェック | PI作成前にサーバーサイドで検証 |
| 注文金額上限 | MAX_ORDER_AMOUNT（デフォルト50,000円）チェック |
| カードレート制限 | 1時間5注文/カードフィンガープリント |
| 日次決済上限 | MAX_DAILY_PAYMENT_AMOUNTチェック |
| 新フローの冪等性 | Idempotency-Keyヘッダー送信 |
| 返金の冪等性 | Idempotency-Key使用 |
| チャージバック処理 | charge.dispute.created webhook + audit_log + メールアラート |
| 不正警告処理 | radar.early_fraud_warning.created webhook + audit_log + メールアラート |
| ステータス変更の楽観的ロック | `.eq('status', currentStatus)`ガード |
| Connect onboardingセキュリティ | JWT/service_role必須 |
