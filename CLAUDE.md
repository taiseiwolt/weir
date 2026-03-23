# AIden - CLAUDE.md

## Overview
AIdenは日本の飲食店向けオールインワンSaaSプラットフォーム。ブランドHP、モバイルオーダー、注文ダッシュボード、顧客管理、管理マスタを提供する。

開発者のTaiseiは非エンジニア。すべての技術実装はClaude Codeに委託している。

---

## Project Structure

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
├── aiden-admin.html                  # 管理マスタ（AIden運営側）
├── aiden-brand-menu.html             # ブランドメニュー一覧
├── aiden-brand-news.html             # ブランドニュース
├── aiden-brand-stores.html           # ブランド店舗一覧
├── aiden-brand-sushiro.html          # ブランドHPトップ（スシローデモ）
├── aiden-customer-admin.html         # 顧客管理画面（店舗管理者向け）
├── aiden-guest-order.html            # ゲスト注文フロー（UIプロトタイプ）
├── aiden-membership.html             # メンバーシッププログラム
├── aiden-mypage.html                 # マイページ
├── aiden-mypage-membership.html      # マイページ（メンバーシップ）
├── aiden-order.html                  # 注文完了・履歴
├── aiden-order-checkout.html         # チェックアウト（決済画面）
├── aiden-order-dashboard.html        # 受注ダッシュボード（タブレット向け）
├── aiden-order-store.html            # モバイルオーダー
├── aiden-order-tracking.html         # 注文トラッキング
├── aiden-privacy.html                # プライバシーポリシー
├── aiden-privacy-client.html         # プライバシーポリシー（事業者向け）
├── aiden-privacy-enduser.html        # プライバシーポリシー（エンドユーザー向け）
├── aiden-sitemap.html                # サイトマップ
├── aiden-store.html                  # 個店ページ
├── aiden-terms.html                  # 利用規約
├── aiden-terms-client.html           # 利用規約（事業者向け）
├── aiden-terms-enduser.html          # 利用規約（エンドユーザー向け）
├── 404.html                          # 404エラーページ
│
├── e2e-customer-admin.spec.js        # E2Eテスト（顧客管理）
├── e2e-data-consistency.spec.js      # E2Eテスト（データ整合性）
├── seed-members.py                   # メンバーシードスクリプト
├── vercel.json                       # Vercel設定
├── package.json                      # npm設定
└── CLAUDE.md                         # このファイル
```

---

## Tech Stack

### Frontend
- Pure HTML / Vanilla JavaScript / CSS（フレームワーク不使用）
- Supabase JS Client v2（CDN経由）
- ライブラリ: Cropper.js（画像トリミング）, Chart.js（グラフ）, flatpickr（日付選択）
- Tailwind CSS

### Backend / Database
- Supabase (PostgreSQL 15)
  - Auth（認証）
  - Edge Functions (Deno/TypeScript)
  - Storage（画像・音声ファイル保存）
  - Realtime（リアルタイム通知）
  - RLS（Row Level Security）
- pg_cron（スケジュール実行）

### API
- Vercel Serverless Functions (Node.js) — 22個から7個に統合済み

### Payment
- Stripe Connect Express（プラットフォーム型決済）
- Webhook: 3イベント設定済み

### AI
- Claude API (Anthropic SDK) — レビュー返信、SNS投稿、経営アドバイス
- OpenAI API (DALL-E) — POP画像生成

### SNS Integration
- X API v2（Lv3: 自動投稿）
- Instagram Graph API（Lv2: 手動 → Meta審査後にLv4）
- LINE Messaging API（Webhook設定済み）

### Voice
- Picovoice Porcupine（"Hey AIden" ウェイクワード）

### POS
- Flutter / Dart（iPad/iPhone向け AIden POS）

### Infrastructure
- Vercel（ホスティング・デプロイ）
- GitHub: https://github.com/taiseiwolt/aiden-demo
- Vercel Demo: https://aiden-demo.vercel.app
- Vercel Production: https://aiden-jp.net
- Supabase: https://iikwusprydaogzeslgdz.supabase.co

### Deployment
- `vercel --prod`（手動デプロイ。GitHub auto-integration は壊れている）
- .env ファイルは .gitignore に含める

---

## Connection Info

### Environment Variables（12個）
- 設定済み: 10個（Supabase URL, Supabase Anon Key, Supabase Service Role Key, Stripe Secret Key, Stripe Publishable Key, Stripe Webhook Secret, LINE Channel Access Token, LINE Channel Secret, その他2個）
- 未設定: ANTHROPIC_API_KEY, OPENAI_API_KEY

### Webhook
- Stripe Webhook: 3イベント
- LINE Callback URL: 設定済み

---

## Coding Rules

### Git
- コード変更時は必ず git commit する
- コミットメッセージは英語で書く（例: `feat: add refund button to order dashboard`）
- 1 commit = 1 機能単位（複数の無関係な変更を1 commitに混ぜない）

### File Versioning
- dot notation（例: v33.8）
- 変更のたびにバージョンを上げる
- versioned ファイル + versionless ファイルの2つを出力する

### HTML Files
- ファイル命名: `aiden-{機能名}.html`
- display_id 形式: prefix + 7桁英数字（例: STR-a1b2c3d）
- モーダル: backdrop付き、ESCキーで閉じる、既存パターンに合わせる
- フォームバリデーション: フロント側でも実施する
- 画面遷移: URLパラメータで store_id, brand_id 等を引き渡す
- console.log: デバッグ完了後に必ず削除する

### JavaScript
- Supabase JS Client v2 を使用（CDN経由）
- API Key はコードにハードコードしない（環境変数経由）
- ユーザー入力値は必ずサニタイズする（XSS対策）

### SQL / Database
- テーブル名: 複数形スネークケース（例: `order_items`）
- 全テーブルに `created_at`, `updated_at` を含める
- 外部キー: 適切な ON DELETE 設定（CASCADE or SET NULL）
- RLS: 全テーブルで有効化必須。ポリシーなしのテーブルを放置しない
- マイグレーション: `supabase/migrations/` に日付プレフィックス付きで保存
- 本番データに影響するSQL: 実行前に SELECT で影響範囲を確認する
- パラメータ化クエリを必ず使用する（SQL Injection対策）

### API (Serverless Functions)
- エンドポイント命名: `/api/{resource}`（RESTful）
- レスポンス形式: `{ success: boolean, data?: any, error?: string }`
- HTTPステータスコード: 200, 400, 401, 404, 500 を適切に使い分ける
- service_role key: サーバーサイドのみで使用（フロントに露出させない）
- 認証が必要なAPI: Supabase Auth の JWT を検証する

---

## AIden Business Rules

### Terminology
- 「顧客」= レストラン事業者（merchant）
- 「エンドユーザー」= 注文する消費者
- この2つを混同しないこと

### Hierarchy
- Corporation（法人）→ Brand（ブランド）→ Store（店舗）の3階層
- データアクセスはこの階層に基づいて制御する
- display_id はすべての階層で使用する

### Pricing
- STD: ¥0/月（無料枠あり）
- PRO: ¥4,980/月/店舗
- EXPERT: ¥9,800/月/店舗
- プラン変更: アップグレード=オペレーター承認+日割り、ダウングレード=翌月1日適用

### Mobile Order Commission
- Dine-in: 3.8%
- Takeout / Delivery: 4.0%
- Stripe手数料 3.6% はAIden負担（実質マージン: dine-in 0.2%, takeout/delivery 0.4%）
- 手数料は割引前の合計金額に対して計算する

### Payment Flow
- authorize-on-order → capture-on-delivery（注文時に与信、提供完了時に確定）
- 返金: プラットフォーム側90日上限、店舗側は管理画面から期間設定可能

### AI Features (Free Tier - STD)
- レビュー返信: 10件/月
- SNS投稿: 10件/月
- POP画像: 1件/月
- 月次AIコメント: 1件

### Guest Orders
- ゲストPII（名前・メール）は事業者に共有しない
- 事業者に見えるのは注文回数 + 日時のみ

### Data / Image Types
- Storage バケット: 7画像タイプ（logo, hero, menu, product, pop, sns, staff）
- 画像トリミング: 4アスペクト比（4:3 メニュー / 16:9 HP+X / 1:1 Instagram / 自由）

### Seed Data
- 4,070 レコード / 13 テーブル
- 160 stores, 1,078 store_hours, 57 products, 252 service_subscriptions 等

---

## 法務文書ガードレール

### 法務文書作成・修正時の必須チェック

法務文書（契約書、覚書、規約、ポリシー、特約）を作成・修正する場合、以下を必ず実行すること:

1. **曖昧表現チェック**: 以下の表現が含まれていないか全文スキャンし、含まれている場合は断定表現または具体的な数値・期限に置き換える
   - 「原則」「原則として」→ 断定表現に（例: 「加盟店が負担する」）
   - 「一般的に」「通常」→ 具体的な条件に
   - 「合理的な」→ 基準を明記するか、不要なら削除
   - 「速やかに」「遅滞なく」→ 具体的な日数に（例: 「7営業日以内に」）
   - 「重大な」→ 基準を定義
   - 「必要に応じて」→ 条件を明記
   - 「可能な限り」→ 義務か努力かを明確に
   - 「適切な」「適当な」→ 基準を明記
   - 「概ね」「おおむね」→ 具体的な範囲に

2. **AIdenリスクチェック**: 作成した条項がAIden側のリスクにならないか確認。特に:
   - コスト負担が曖昧になっていないか
   - 免責範囲が狭すぎないか
   - 期限や上限が未設定になっていないか

3. **外部弁護士確認推奨の明示**: リスクが高い条項には `<!-- ※外部弁護士の確認を推奨 -->` コメントを付記

4. **完了報告に曖昧表現チェック結果を含める**: 「曖昧表現チェック: 検出0件」または「検出N件、全て修正済み」を報告に含める

### エージェント横断の品質チェック

CC依頼の実装時、以下の領域にまたがる場合は各観点を考慮すること:

- **法務文書** → Legal Director, Compliance Checker, Privacy Officerの観点
- **決済関連** → Stripe Integrator, Fee Reconciler, Finance Managerの観点
- **セキュリティ** → Security Auditor, Privacy Officerの観点
- **顧客向けUI/UX** → Frontend Builder, CSS Designer, POC Plannerの観点
- **データ設計** → Supabase Architect, Data Engineer, Data Quality Checkerの観点

---

## Work Style Rules

### Communication
- 日本語でコミュニケーションする
- エラーが出た場合は原因と修正内容だけ簡潔に報告する（途中経過は不要）
- デバッグの途中経過は省略し、最終的な原因と修正内容だけ伝える

### Decision Authority
- ビジネス判断（仕様変更・機能追加の方向性）: 必ずTaiseiに確認してから実装
- 技術判断（実装方法の選択）: Claude Codeの裁量でOK
- SQL実行: 自動でOK（ただし本番データ変更時はSELECTで事前確認）

### Before Starting Any Task
1. 変更対象のファイルの現状を確認する
2. 関連するテーブル構造やAPIを把握する
3. 既存のコードパターンに合わせる

### After Completing Any Task
1. コードをセルフレビューする（問題があれば自分で修正してから報告）
2. git commit する
3. 変更内容のサマリだけ簡潔に報告する

### Agents
- `.claude/agents/` に12のエージェント定義がある
- 各エージェントはタスクの技術領域に応じて参照する
- 既存の `~/.claude/commands/` の6スキルも引き続き使用可能

---

## Key Reference Documents
- `aiden-data-architecture.md` — 30テーブル/12カテゴリのDB設計
- `aiden-template-uiux-analysis.md` — 5テンプレートUIの設計
- `aiden-stitch-prompts.md` — テンプレート生成プロンプト
- `aiden-us-brand-pattern-analysis.md` — USブランドUIパターン分析

---

## Timezone
- JST (Asia/Tokyo) を基準とする
- DBのtimestamp: UTC保存 → 表示時にJST変換
- pg_cronのスケジュール: UTCで設定する（JST深夜3時 = UTC 18:00前日）

---

## Agent Teams Configuration

### 有効化
settings.json に CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" を設定済み。

### QA Team (aiden-qa-team)
- リーダー: QA Lead（タスク登録・結果集約・最終レポート）
- チームメイト: auto-tester / chrome-visual / chrome-destructive / db-verifier / critical-observer
- 出力先: ~/Desktop/aiden-demo/qa-results/{agent-name}/
- 通信ルール:
  - バグ発見 → QA Lead に即報告（DM）
  - DB関連バグ → db-verifier にも同時にDM
  - ブロードキャスト = クリティカルバグ（決済・個人情報系）のみ
  - chrome-visual と chrome-destructive は同一ページ同時テスト禁止（QA Leadがタスクリストで制御）
- テスト用データには `_test_` プレフィックスを付与（本番データ汚染防止）

### 共通ルール
- ブロードキャストは最小限（トークンコスト削減）
- 各チームメイトは完了時にサマリをQA Leadに報告
- テスト用データには `_test_` プレフィックスを付与
