# Weir - CLAUDE.md

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
Weirは日本の飲食店向けオールインワンSaaSプラットフォーム。ブランドHP、モバイルオーダー、注文ダッシュボード、顧客管理、管理マスタを提供する。

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
- Picovoice Porcupine（"Hey Weir" ウェイクワード）
- Flutter / Dart（iPad/iPhone向け Weir POS）

### Infrastructure / Deployment
- Vercel（ホスティング・デプロイ）、GitHub: https://github.com/taiseiwolt/aiden-demo
- Vercel Demo: https://weir.vercel.app 、Production: https://xorder.co.jp
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

## Weir Business Rules

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
- Stripe手数料 3.6% はWeir負担（実質マージン: dine-in 0.2%, takeout/delivery 0.4%）
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
- `~/.claude/skills/weir/` の6スキル（weir-challenge/product/qa/spec/supabase/task）も引き続き使用可能
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

## Gotchas（過去の失敗パターン・作業前に必ず確認）

### DB削除
- **FK制約はinformation_schemaから必ず全取得してからDELETE文を生成する。推測で生成しない**（2026-04-13: 手戻り6回発生）
- 削除対象が1件と思っても配下に複数エンティティが存在する場合がある（炭火亭ブランドは7店舗存在していた）
- 存在しないテーブル: `coupon_usages`, `chat_policies`, `compensation_points`（マイグレーションに定義なし）
- CASCADE設定済みでも手動DELETEが必要なテーブルが存在する

### 一括登録（Bulk Import）
- `BULK_TEMPLATES`（データ一括管理ページ）と`TEMPLATES`（法人/ブランドタブの📋ボタン）は**別システム**で列定義が異なる。混同するとパース失敗・0件登録バグが発生する（2026-04-13実績）
- ブランド作成後は`CBR.push({corp_id, brand_id, role:'owner'})`を必ず実行。ないと法人詳細のブランド一覧タブに表示されない
- `VENUES.push`には`corpUuid`フィールドが必要。ないと法人詳細の店舗一覧タブに表示されない
- `format:'csv'`のテンプレートはExcelドロップダウン（dvDefs）が使用不可。プルダウンが必要な場合はxlsxに変更する

### ハードコード（D-83）
- **初期値（`let STORE = {...}`, `let STORES = [...]`）にブランド固有データを入れない**。DB取得失敗時にそのままエンドユーザーに表示される
- fallbackの`|| '焼肉 炭火亭'`も違反。`|| ''`またはnullにする
- DB loaderが存在しないまま放置されるケースがある。修正前に`loadXxx()`関数の有無を確認する

### サービス設定
- `service_subscriptions`が空配列の場合は制限なし（全注文モードで注文可能）。`venues.takeout_enabled`/`delivery_enabled`でfallback判定が必要
- 来店予約ON/OFFは`service_subscriptions`（key=`'reservation'`）で管理し`venues.reservation_enabled`と連動させる

### orders PII カラム（anon REVOKE 済み）
- **`orders` の 6 カラムは anon から SELECT 不可**: `customer_name` / `customer_email` / `customer_phone` / `delivery_address` / `delivery_lat` / `delivery_lng`。`sec11_revoke_pii_columns.sql` が anon の列レベル GRANT を剥がしているため、PostgREST は「column does not exist」エラーを返す（2026-04-21 CC-21 / CC-24 実績）
- 顧客名は会員: `members` テーブルを `orders.member_id` で JOIN / 別クエリ取得。ゲスト: 表示しない（`'ゲスト'`）
- 配送情報（delivery_*）は admin UI では参照しない。必要なら EF（service_role）経由または tracking_token RPC（`get_order_by_tracking_token`, SECURITY DEFINER）経由で取得する
- ゲスト PII 露出を避けるため、管理画面では customer_* / delivery_* を参照しないこと。CC-24 調査で admin UI (`weir-admin.html` / `weir-customer-admin.html` / `weir-order-dashboard.html`) には delivery_* の参照なしを確認済（2026-04-21）

### 空データ時の文言統一
- データ未存在時は `renderEmptyState({icon, title, description})` ヘルパーを使う（`weir-admin.html` / `weir-customer-admin.html` に定義済み）
- テンプレート: シンプル版「まだ {対象} のデータはありません」「{対象を追加/連携}すると、ここに表示されます」、連携待ち版「Stripe Billing 連携の設定後、自動的に表示されます」

### オンボフロー（CC-22a 配置 + fix、2026-04-21）
- `weir-onboarding.html` は **mock 動作の UI 骨格のみ**。Backend / 実 AI 呼び出し / Realtime 進捗 / DB 書き込みは **全て CC-22b 以降で実装予定**
- Mock データは `MOCK_DATA_SOURCE` オブジェクトに集約（getPreviews / getConfirmationPackage / getSimulatedProgressPlan / getWorkflowStages）。CC-22b で差し替える
- Step 3 の 16 枚は内部で `modelName` (Claude / GPT / Gemini / Grok) を保持、UI には**一切表示しない**（D-196 準拠）。選択時に `console.info` で記録、CC-22b で `ai_model_change_log` INSERT に差し替える
- Step 3 のタイル表示は「トーン × 業態（例: 温かみ × 居酒屋の温かい店内）」の 2 軸。内部 `unsplashId` でデバッグ可能
- Step 2 のカードは **工程名**（ブランド分析 / 雰囲気構築 / 演出設計 / 最終仕上げ）で加盟店に意図を伝える。絵文字は全廃（🤖 / 🎨 削除、CSS/SVG オーブ演出に置換）
- LocalStorage キー `weir_onboarding_state_v1` で中断復帰対応。写真の dataUrl が 4MB を超えたら metadata のみ保存にフォールバック
- Step 4 完了後:「後で選ぶ」→ `/weir-admin.html` へ遷移、「続いてプランを選ぶ」→ toast（CC-22d まで）
- **CC-22b で削除要**: Mock 画像は `images.unsplash.com`（既存 CSP 許可済）から curated 21 枚 photo ID で供給。Supabase Storage 移行時に `MOCK_DATA_SOURCE.getPreviews/getConfirmationPackage` の URL を差し替える
- **Step 1 は黒背景 + 白文字 + Red Hat Display**（CC-22a-fix2、2026-04-22）。viewport 全面（`body.step1-active` で `overflow:hidden`）、縦スクロールなしの 9 画面 Typeform 方式。Step 2/3/4 も同じ方針で刷新予定
- **Weir ブランドフォント**: Red Hat Display（英字）+ Noto Sans JP（日本語）。全 Weir UI で統一展開予定（D-204）。Google Fonts 経由、CSP は既存で許可済み
- **Weir カラー体系**（D-205）: 黒 `#000000` / 白 `#FFFFFF` / エメラルド `#10B981`（active）+ `#059669`（done）。進捗ドット・アクセントは緑系、紫 `#6c5ce7` は非推奨
- **Weir ロゴ（黒背景・横型）**: `/weir-header-black.png`（リポジトリ直下）。依頼文では `weir-horizontal-tight-black.png` と呼ばれることがあるが同一画像
- **共通 `.onb-header` は全 Step で常時表示**（CC-22a-fix3、2026-04-22）。`body.step1-active` で非表示にする運用はやめた。Step 1 v2 は共通ヘッダー下から（`top:var(--header-h)`）開始
- **`.onb-step` の `display` は CSS specificity 注意**: `#step1.step1-v2` は ID+class で `.onb-step.active` より勝つ。必ず `#step1.step1-v2{display:none}` + `#step1.step1-v2.active{display:block}` で ID セレクタ同士で決着（CC-22a-fix3 Q9 遷移バグ教訓）
- **Step 1 背景アニメーション**: エメラルド blob 3 つ（filter:blur 100px）+ SVG mesh、`.bg-animation` レイヤー z-index:0、`.s1v2-app` z-index:1。`prefers-reduced-motion:reduce` で停止、モバイルでは blob サイズと blur 縮小
- **セルフオンボーディング入口**（D-206）: 将来加盟店が自力で Weir を始める入口画面。動的背景は先進性演出の差別化要素として Step 1 〜 4 全体に展開済み（CC-22a-fix4）
- **Weir デザイン言語 Step 1-4 統一完了**（CC-22a-fix4、2026-04-22）: 全 Step で黒背景 + Red Hat Display + Noto Sans JP + 共通 `.weir-bg-animation`（5 blobs + mesh、モバイルは 3 blobs）+ エメラルド #10B981 アクセント。紫 (`#6c5ce7`) 系のオーブ / グロー / カードは完全撤去
- **Step 2 の AI 演出**: 波紋リング 4 本 (`keyframes s2-ripple`) + 中央インクブロッチ (`s2-blot`) の監視感。進捗バーは削除し共通ヘッダーのドット進捗に統合。4 stage cards は `working/done` で emerald 化
- **Step 3 の 16 タイル**: 4x4 コンパクト（aspect-ratio 4/3、clamp サイズ）+ クリックで dark 詳細モーダル。1 viewport 完結。モバイルは 2 列 + 内部スクロール許容
- **Step 4 は 3 サブステップ分割**（D-207）: `state.step4Sub` (1/2/3) で `.sub-step` 切替。4-1 = hero + reveal、4-2 = 5-point preview カード（クリックで詳細モーダル）、4-3 = summary + CTA。メインプログレスは Step 4 全体で active 維持、`.sub-nav .sub-dot` で内部進捗を表示
- **Step 4-3 最終 CTA**（D-208）: Primary = 「管理マスタで使ってみる」→ `/weir-admin.html`、Secondary = 「後で選ぶ」。「続いてプランを選ぶ」はオンボ完了後の別フロー（CC-22d 管轄）に譲渡
- **`MOCK_DATA_SOURCE.getConfirmationPackage` のフィールド拡張**（CC-22a-fix4）: 既存の `id/type/narrative/title/imgUrl/contentText` に加え `hint`（4-2 カードの一言）、`previewText`（モーダル詳細文）、`meta`（3 タグ配列）を追加。CC-22b で実 API 接続時は各メソッドを差し替えるだけで互換
- **`MOCK_DATA_SOURCE.getBrandSummary`**（CC-22a-fix4 新規）: 4-3 サマリ用 3 セクション（お店の個性 / ブランドボイス / お客様との距離感）
- **Step 3 Unsplash 画像は内容確認必須**: photo ID 差替時は人物メインや業態不一致に注意（例: warmth-3「昔ながらの喫茶店」/ modern-1「スタイリッシュなバー」/ modern-3「デザインカフェ」は過去に不一致報告あり）

---

## Agent Teams
詳細は `.claude/agents/README.md` 参照。
- チームB（プロジェクト実行）: `agents-project-execution.md`、Taisei承認ポイント3箇所
- チームC（セキュリティ）: `security/` 配下、`/team-c` コマンドで実行
