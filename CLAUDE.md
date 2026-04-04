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
├── brand.html                        # ブランドHPトップ（スシローデモ）
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
├── e2e-customer-admin.spec.cjs       # E2Eテスト（顧客管理）
├── e2e-data-consistency.spec.cjs     # E2Eテスト（データ整合性）
├── playwright.config.cjs             # Playwright設定
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

### Git 競合防止ルール（必須）
⚠️ **複数のClaude Codeセッションが同時にこのリポジトリを編集している可能性がある。以下を必ず守ること。**

1. **作業開始前**: 必ず `git pull origin main` を実行して最新のコードを取得する
2. **ファイル編集前**: `git log --oneline -5 <対象ファイル>` で直近の変更履歴を確認する
3. **コミット前**: `git diff HEAD` で自分の変更のみが含まれていることを確認する。他のセッションが行った変更が消えていないか必ずチェックする
4. **push前**: `git pull --rebase origin main` を実行し、コンフリクトがあれば解決してからpushする
5. **同一ファイルの並列編集禁止**: 他のセッションが編集中のファイルには触れない。不明な場合はgit logで直近のコミット時刻を確認し、数分以内のコミットがあれば競合リスクありと判断する

### 言語別規約
詳細は `.claude/rules/` を参照:
- `sql.md` — SQL/Supabase（RLS、マイグレーション、pg_cron）
- `javascript.md` — JS（escH()、XSS対策、Supabase Client）
- `html.md` — HTML/CSS（命名、モーダル、バージョニング）
- `api.md` — Serverless Functions（REST設計、認証）
- `legal.md` — 法務文書ガードレール（曖昧表現チェック、リスクチェック）

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
1. **`git pull origin main` で最新コードを取得する（最重要）**
2. 変更対象のファイルの現状を確認する
3. `git log --oneline -5 <対象ファイル>` で直近の変更を確認し、他セッションとの競合リスクがないか確認する
4. 関連するテーブル構造やAPIを把握する
5. 既存のコードパターンに合わせる

### Verification
タスク完了の判定基準:
- `npm run lint` が pass する（console.log残存なし）
- HTML変更時: ブラウザで表示確認
- API変更時: curl or Supabase CLIで動作確認

### After Completing Any Task
1. コードをセルフレビューする（問題があれば自分で修正してから報告）
2. `npm run lint` を実行して品質チェック
3. `git pull --rebase origin main` で最新を取り込み、競合がないか確認する
4. git commit する
5. `git push origin main` する
6. 変更内容のサマリだけ簡潔に報告する
7. 手動作業（DBマイグレーション・環境変数設定・Edge Functionデプロイ等）がある場合は完了報告の先頭に「⚠️ 手動作業あり」セクションを設けて番号付きで列挙する

### Agents
- `.claude/agents/` にエージェント定義がある（現在: agents-legal.md に4エージェント）
- 各エージェントはタスクの技術領域に応じて参照する
- 既存の `~/.claude/commands/` の6スキルも引き続き使用可能
- エージェント横断の品質チェック（法務文書ガードレールセクション参照）で、未定義ドメインの観点も考慮する

---

## Key Reference Documents
- `aiden-data-architecture.md` — 30テーブル/12カテゴリのDB設計
- `aiden-template-uiux-analysis.md` — 5テンプレートUIの設計
- `aiden-stitch-prompts.md` — テンプレート生成プロンプト
- `aiden-us-brand-pattern-analysis.md` — USブランドUIパターン分析
- `docs/research/ebica_competitor_full_analysis.xlsx` — 予約管理4社競合分析（下記参照）

## 競合分析資料（2026年4月作成）

格納先: `docs/research/ebica_competitor_full_analysis.xlsx`

### 概要
ebica / TableCheck / TORETA / レストランボードの4社を対象とした予約管理システムの競合分析。
9シート構成（ebica機能一覧46件、UIUX設計観点12画面、AIden示唆15件、料金比較8件、部門横断分析42件、即アクション13件、4社機能比較47件、部門別競合分析22件、AIden戦略示唆18件）

### AIdenの差別化ポイント（4社ともゼロの機能）
- AIレビュー返信（Claude API）
- AI SNS投稿自動生成（Claude API）
- AI POP画像生成（Claude API）
- 30テーブル12カテゴリのデータ蓄積（将来B2Bコンサル基盤）
- 全注文事前決済（Stripe authorize→capture、ノーショー根本解決）
- STD ¥0フリーミアム（レストランボード並みの参入障壁低減+AI機能付き）

### 戦略方針
- 「予約管理」カテゴリで4社と正面から競争しない
- 新カテゴリ「AI統合型 飲食店経営プラットフォーム」を創出
- グルメサイト連携数やPOS連携数では勝負しない
- MO+POS+CRM+AI+予約管理の統合で他社にない価値を提供

### 予約管理サービス設計時の参考ポイント
- 自動配席ロジック（テーブル×人数×時間帯のルールベース）→ ebica/TORETA参照
- 満席時代替提案（他時間帯/他店舗の空席自動案内）→ ebica/TableCheck参照
- 確認ボタン付きリマインダー（ステータス自動更新）→ TableCheck参照
- ドラッグ&ドロップ型予約カレンダー → TORETA参照
- 退店後アンケート自動送信 → TORETAカスタマーボイス参照

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

### チームB（プロジェクト実行チーム）
- 機能追加・修正プロジェクトはチームBのフロー（①〜⑧）に従って遂行する
- ⑦ Devil's Advocate と ⑧ Project Supervisor は常時稼働
- Taiseiの承認ポイントは3箇所: ①要件確定後 / ④CC依頼文完成後 / ⑦最終判定後
- チームAとの連携: ①②④完了時に必ずチームA関連エージェントのレビューを実施
- 詳細は .claude/agents/agents-project-execution.md を参照

### 共通ルール
- ブロードキャストは最小限（トークンコスト削減）
- 各チームメイトは完了時にサマリをQA Leadに報告
- テスト用データには `_test_` プレフィックスを付与
