# Weir Project Structure

CLAUDE.md から切り出したプロジェクト構造ツリー。Claude Code が毎回読む必要はなく、構造を確認したいときだけ参照する。

```
aiden-demo/
├── api/                              # Vercel Serverless Functions (7 endpoints)
│   ├── _lib/                         # 共有ユーティリティ
│   │   ├── auth.js                   #   認証ヘルパー
│   │   ├── response.js               #   レスポンスフォーマット
│   │   ├── stripe.js                 #   Stripe初期化
│   │   └── supabase.js               #   Supabase初期化
│   ├── delivery/[...path].js         # デリバリー関連API
│   ├── health.js                     # ヘルスチェック
│   ├── members/[...path].js          # メンバーシップ・会員API
│   ├── menu/[...path].js             # メニュー取得API
│   ├── orders/[...path].js           # 注文CRUD API
│   ├── payments/webhook.js           # Stripe Webhook受信
│   └── restaurants/[...path].js      # レストラン・店舗API
│
├── supabase/
│   ├── functions/                    # Supabase Edge Functions (15 functions)
│   │   ├── compensation-point-grant/
│   │   ├── confirm-order/
│   │   ├── generate-invoice-pdf/
│   │   ├── generate-monthly-invoice/
│   │   ├── google-places-background-collector/
│   │   ├── google-reviews-collector/
│   │   ├── line-auth-callback/
│   │   ├── line-auth-redirect/
│   │   ├── log-payment-failure/
│   │   ├── send-invoice-email/
│   │   ├── send-order-email/
│   │   ├── stripe-connect-create/
│   │   ├── stripe-connect-onboarding/
│   │   ├── stripe-create-payment-intent/
│   │   └── stripe-create-refund/
│   └── migrations/                   # DBマイグレーション (9 files)
│       ├── 20260316100000_membership_program.sql
│       ├── 20260317000000_compensation.sql
│       ├── 20260317100000_invoices.sql
│       ├── 20260317100001_invoice_cron.sql
│       ├── 20260318000000_member_triggers_and_channel.sql
│       ├── 20260318100000_customer_support.sql
│       ├── 20260318200000_google_reviews.sql
│       ├── 20260318200001_google_reviews_cron.sql
│       └── 20260319000000_payment_attempts.sql
│
├── sql/                              # スタンドアロンSQLスクリプト
│   ├── 001_auth_members.sql
│   ├── 002_orders_payment.sql
│   ├── 003_realtime_orders.sql
│   ├── 004_registration_incentives.sql
│   ├── 005_guest_pii_management.sql
│   ├── 006_customer_support.sql
│   └── cleanup_pending_orders.sql
│
├── qa-screenshots/                   # QAスクリーンショット
├── test-results/                     # テスト結果
│
│── ## HTML Files (versionless)
├── weir-admin.html                  # 管理マスタ（Weir運営側）
├── weir-brand-menu.html             # ブランドメニュー一覧
├── weir-brand-news.html             # ブランドニュース
├── weir-brand-stores.html           # ブランド店舗一覧
├── brand.html                        # ブランドHPトップ（スシローデモ）
├── weir-customer-admin.html         # 顧客管理画面（店舗管理者向け）
├── weir-guest-order.html            # ゲスト注文フロー（UIプロトタイプ）
├── weir-membership.html             # メンバーシッププログラム
├── weir-mypage.html                 # マイページ
├── weir-mypage-membership.html      # マイページ（メンバーシップ）
├── weir-order.html                  # 注文完了・履歴
├── weir-order-checkout.html         # チェックアウト（決済画面）
├── weir-order-dashboard.html        # 受注ダッシュボード（タブレット向け）
├── weir-order-store.html            # モバイルオーダー
├── weir-order-tracking.html         # 注文トラッキング
├── weir-privacy.html                # プライバシーポリシー
├── weir-privacy-client.html         # プライバシーポリシー（事業者向け）
├── weir-privacy-enduser.html        # プライバシーポリシー（エンドユーザー向け）
├── weir-sitemap.html                # サイトマップ
├── weir-store.html                  # 個店ページ
├── weir-terms.html                  # 利用規約
├── weir-terms-client.html           # 利用規約（事業者向け）
├── weir-terms-enduser.html          # 利用規約（エンドユーザー向け）
├── 404.html                          # 404エラーページ
│
├── e2e-customer-admin.spec.cjs       # E2Eテスト（顧客管理）
├── e2e-data-consistency.spec.cjs     # E2Eテスト（データ整合性）
├── playwright.config.cjs             # Playwright設定
├── seed-members.py                   # メンバーシードスクリプト
├── vercel.json                       # Vercel設定
├── package.json                      # npm設定
└── CLAUDE.md                         # プロジェクト指示書
```
