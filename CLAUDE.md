# AIden - CLAUDE.md

> **CRITICAL RULES（違反厳禁）**
> 1. **Git必須**: 作業開始前に `git pull origin main`、完了後に `git pull --rebase origin main` → commit → push。並列セッションがあるため必須
> 2. **用語厳守**: 「顧客」=レストラン事業者（merchant）、「エンドユーザー」=注文する消費者。混同禁止
> 3. **ゲストPII非共有**: ゲスト注文の名前・メールは事業者に一切見せない
> 4. **XSS対策必須**: innerHTMLにDB/APIデータを入れる際は必ず `escH()` でエスケープ
> 5. **ビジネス判断は要承認**: 仕様変更・機能追加の方向性は必ずTaiseiに確認してから実装
> 6. **3階層を必ず意識**: merchant（法人）→ Brand → venue（店舗）。DBはmerchants/brands/venues
> 7. **ハードコード禁止（D-83）**: データの生成・表示にハードコード一切禁止。nullの方がマシ

---

## Overview
AIdenは日本の飲食店向けオールインワンSaaSプラットフォーム。ブランドHP、モバイルオーダー、注文ダッシュボード、顧客管理、管理マスタを提供する。

開発者のTaiseiは非エンジニア。すべての技術実装はClaude Codeに委託している。

---

## Project Structure
詳細は `docs/project-structure.md` 参照（必要時のみ読み込む）。

---

## Tech Stack

### Frontend
- Pure HTML / Vanilla JavaScript / CSS（フレームワーク不使用）
- Supabase JS Client v2（CDN経由）
- ライブラリ: Cropper.js（画像トリミング）, Chart.js（グラフ）, flatpickr（日付選択）
- Tailwind CSS

### Backend / Database
- Supabase (PostgreSQL 15) — Auth / Edge Functions (Deno/TS) / Storage / Realtime / RLS
- pg_cron（スケジュール実行）

### API / Payment / AI
- Vercel Serverless Functions (Node.js) — 22個から7個に統合済み
- Stripe Connect Express（Webhook: 3イベント設定済み）
- Claude API (Anthropic SDK) — レビュー返信、SNS投稿、経営アドバイス
- OpenAI API (DALL-E) — POP画像生成

### SNS / Voice / POS
- X API v2（Lv3: 自動投稿）、Instagram Graph API（Lv2: 手動 → Meta審査後にLv4）、LINE Messaging API
- Picovoice Porcupine（"Hey AIden" ウェイクワード）
- Flutter / Dart（iPad/iPhone向け AIden POS）

### Infrastructure / Deployment
- Vercel（ホスティング・デプロイ）、GitHub: https://github.com/taiseiwolt/aiden-demo
- Vercel Demo: https://aiden-demo.vercel.app 、Production: https://aiden-jp.net
- Supabase: https://iikwusprydaogzeslgdz.supabase.co
- `vercel --prod`（手動デプロイ。GitHub auto-integration は壊れている）
- .env ファイルは .gitignore に含める

---

## Connection Info
- 環境変数12個中10個設定済み（Supabase / Stripe / LINE）、未設定: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- Stripe Webhook: 3イベント設定済み
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
3. **コミット前**: `git diff HEAD` で自分の変更のみが含まれていることを確認する
4. **push前**: `git pull --rebase origin main` を実行し、コンフリクトがあれば解決してからpushする
5. **同一ファイルの並列編集禁止**: 他のセッションが編集中のファイルには触れない

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
- 「顧客」= レストラン事業者（merchant）、「エンドユーザー」= 注文する消費者。混同禁止

### Hierarchy
- merchant（法人）→ Brand（ブランド）→ venue（店舗）の3階層
- データアクセスはこの階層に基づいて制御する。display_id はすべての階層で使用する
- DBテーブル名: merchants / brands / venues（corporations・stores は廃止済み）

### Pricing
- STD: ¥0/月（無料枠あり）、PRO: ¥4,980/月/店舗、EXPERT: ¥9,800/月/店舗
- プラン変更: アップグレード=オペレーター承認+日割り、ダウングレード=翌月1日適用

### Mobile Order Commission
- Dine-in: 3.8%、Takeout / Delivery: 4.0%
- Stripe手数料 3.6% はAIden負担（実質マージン: dine-in 0.2%, takeout/delivery 0.4%）
- 手数料は割引前の合計金額に対して計算する

### Payment Flow
- authorize-on-order → capture-on-delivery（注文時に与信、提供完了時に確定）
- 返金: プラットフォーム側90日上限、店舗側は管理画面から期間設定可能

### AI Features (Free Tier - STD)
- レビュー返信: 10件/月、SNS投稿: 10件/月、POP画像: 1件/月、月次AIコメント: 1件

### Guest Orders
- ゲストPII（名前・メール）は事業者に共有しない
- 事業者に見えるのは注文回数 + 日時のみ

### Hardcode 禁止（D-83）
- データの生成・表示にハードコードを使用することは一切禁止
- フロント・バックエンド問わず全コードに適用
- nullになる方がハードコードデータを表示するよりマシ
- 違反例: `const ORDERS = [{id:'ORD-001', name:'炭火亭'...}]`
- 許容例: CSVテンプレートDL用のsample行（画面に表示しないもの）

### Data / Image Types
- Storage バケット: 7画像タイプ（logo, hero, menu, product, pop, sns, staff）
- 画像トリミング: 4アスペクト比（4:3 メニュー / 16:9 HP+X / 1:1 Instagram / 自由）

### Seed Data
- 4,070 レコード / 13 テーブル（160 stores, 1,078 store_hours, 57 products, 252 service_subscriptions 等）

---

## Work Style Rules

### Communication
- 日本語でコミュニケーションする
- エラーが出た場合は原因と修正内容だけ簡潔に報告する（途中経過は不要）

### Decision Authority
- ビジネス判断（仕様変更・機能追加の方向性）: 必ずTaiseiに確認してから実装
- 技術判断（実装方法の選択）: Claude Codeの裁量でOK
- SQL実行: 自動でOK（ただし本番データ変更時はSELECTで事前確認）

### Before Starting Any Task
1. **`git pull origin main` で最新コードを取得する（最重要）**
2. 変更対象のファイルの現状を確認する
3. `git log --oneline -5 <対象ファイル>` で直近の変更を確認し、他セッションとの競合リスクがないか確認
4. 関連するテーブル構造やAPIを把握する
5. 既存のコードパターンに合わせる

### Verification
- `npm run lint` が pass する（console.log残存なし）
- HTML変更時: ブラウザで表示確認
- API変更時: curl or Supabase CLIで動作確認

### After Completing Any Task
1. コードをセルフレビューする（問題があれば自分で修正してから報告）
2. `npm run lint` を実行して品質チェック
3. `git pull --rebase origin main` で最新を取り込み、競合がないか確認
4. git commit → git push origin main
5. 変更内容のサマリだけ簡潔に報告する
6. 手動作業（DBマイグレーション・環境変数設定・Edge Functionデプロイ等）がある場合は完了報告の先頭に「⚠️ 手動作業あり」セクションを設けて番号付きで列挙する

### Agents
- `.claude/agents/` にエージェント定義: business/corporate/engineering/legal/operations/project-execution の6ファイル + security/配下7ファイル
- `~/.claude/skills/aiden/` の6スキル（aiden-challenge/product/qa/spec/supabase/task）も引き続き使用可能
- エージェント横断の品質チェック（.claude/rules/legal.md 参照）で、未定義ドメインの観点も考慮する

---

## Key Reference Documents
- `aiden-data-architecture.md` — 30テーブル/12カテゴリのDB設計
- `aiden-template-uiux-analysis.md` — 5テンプレートUIの設計
- `aiden-stitch-prompts.md` — テンプレート生成プロンプト
- `aiden-us-brand-pattern-analysis.md` — USブランドUIパターン分析
- `docs/research/ebica_competitor_full_analysis.xlsx` — 予約管理4社競合分析（ebica/TableCheck/TORETA/レストランボード、9シート構成）

---

## Timezone
- JST (Asia/Tokyo) を基準とする
- DBのtimestamp: UTC保存 → 表示時にJST変換
- pg_cronのスケジュール: UTCで設定する（JST深夜3時 = UTC 18:00前日）

---

## Agent Teams
詳細は `.claude/agents/README.md` 参照。
- チームB（プロジェクト実行）: `agents-project-execution.md`、Taisei承認ポイント3箇所
- チームC（セキュリティ）: `security/` 配下、`/team-c` コマンドで実行
