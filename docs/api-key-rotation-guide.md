# APIキーローテーション手順書

最終更新: 2026-03-22

---

## 対象キー一覧

| # | キー名 | 保存場所 | 想定時間 |
|---|--------|---------|---------|
| 1 | Supabase Anon Key (Publishable) | フロントHTML 21ファイル | 15分 |
| 2 | Supabase Service Role Key | Vercel環境変数 + Supabase Secrets | 5分 |
| 3 | Supabase Access Token | ローカル開発用 | 3分 |
| 4 | Stripe Secret Key | Supabase Secrets | 5分 |
| 5 | Stripe Publishable Key | フロントHTML 1ファイル | 3分 |
| 6 | ANTHROPIC_API_KEY | Vercel環境変数 | 3分 |
| 7 | OPENAI_API_KEY | Vercel環境変数 | 3分 |

---

## 1. Supabase Anon Key (Publishable)

### 保存場所（全箇所）

**フロントエンドHTMLファイル（21ファイル）:**
- `weir-admin.html`
- `weir-brand-menu.html` / `aiden-brand-menu-v1.7.html`
- `weir-brand-news.html` / `aiden-brand-news-v1.4.html`
- `weir-brand-stores.html` / `aiden-brand-stores-v1.4.html`
- `aiden-brand-sushiro.html` / `aiden-brand-sushiro-v4.5.html`
- `weir-customer-admin.html` / `aiden-customer-admin-v24.91.html`
- `weir-membership.html`
- `weir-mypage.html`
- `weir-mypage-membership.html`
- `weir-order-checkout.html` / `aiden-order-checkout-v13.html`
- `weir-order-dashboard.html` / `aiden-order-dashboard-v22.7.html`
- `weir-order-store.html` / `aiden-order-store-v2_9.html`
- `weir-store.html` / `aiden-store-v5.4.html`

**変数名:** `SUPABASE_KEY` または直接文字列として記載

**Vercel環境変数:**
- `SUPABASE_ANON_KEY`

**Supabase Edge Functions:**
- 自動注入（`SUPABASE_URL` と `SUPABASE_ANON_KEY` はSupabaseが自動設定）

### 新しいキーの発行方法
1. Supabase Dashboard → Settings → API
2. 「anon public」キーは **プロジェクト再作成でのみ変更可能**
3. 通常のローテーションでは、JWTシークレットを変更することで全キーが無効化される

> **注意**: Supabase Anon Keyはプロジェクト固有のため、通常はローテーション不要。漏洩した場合はRLSポリシーが保護層となる。

### 差し替え手順
1. Supabase Dashboard → Settings → API でキーを確認
2. 全HTMLファイルで一括置換: 旧キー → 新キー
   ```bash
   cd ~/Desktop/aiden-demo
   grep -rl "旧キー文字列" --include="*.html" | xargs sed -i '' 's/旧キー文字列/新キー文字列/g'
   ```
3. Vercel Dashboard → Settings → Environment Variables → `SUPABASE_ANON_KEY` を更新
4. `vercel --prod` で再デプロイ

### 動作確認
- 任意のHTML画面を開き、Supabase接続が成功すること（ブラウザコンソールにエラーなし）
- モバイルオーダーでメニュー一覧が表示されること

---

## 2. Supabase Service Role Key

### 保存場所
- **Vercel環境変数**: `SUPABASE_SERVICE_ROLE_KEY`
- **Supabase Edge Functions Secrets**: 自動注入（変更不要）
- **コード参照箇所**: `api/_lib/supabase.js` で `process.env.SUPABASE_SERVICE_ROLE_KEY` として使用

### 新しいキーの発行方法
- Supabase Anon Keyと同様、プロジェクト固有のため通常は変更不可

### 差し替え手順
1. Supabase Dashboard → Settings → API で `service_role` キーを確認
2. Vercel Dashboard → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` を更新
3. `vercel --prod` で再デプロイ

### 動作確認
- `/api/health` にアクセスして200が返ること
- 注文APIが正常動作すること（テスト注文 → キャンセル）

---

## 3. Supabase Access Token

### 保存場所
- **ローカル**: Supabase CLI設定 (`~/.supabase/`)
- **現在の期限**: 2026-04-15

### 新しいキーの発行方法
1. Supabase Dashboard → Settings → Access Tokens
2. 「Generate new token」をクリック
3. トークン名（例: `aiden-dev-2026Q2`）を入力
4. 「Generate token」をクリック
5. 表示されたトークンをコピー（**この画面でしか表示されない**）

### 差し替え手順
1. 古いトークンを Revoke（Dashboard → Access Tokens → 該当トークンの「Revoke」）
2. 新しいトークンを発行（上記手順）
3. ローカル環境で設定:
   ```bash
   supabase login --token sbp_新しいトークン
   ```

### 動作確認
```bash
supabase projects list
```
プロジェクト一覧が表示されればOK。

### 想定時間: 3分

---

## 4. Stripe Secret Key

### 保存場所
- **Supabase Edge Functions Secrets**: `STRIPE_SECRET_KEY`
- **Vercel環境変数**: `STRIPE_SECRET_KEY`
- **使用箇所（Edge Functions）**:
  - `stripe-create-payment-intent`
  - `stripe-create-refund`
  - `confirm-order`
  - `stripe-connect-create`
  - `stripe-connect-onboarding`
- **使用箇所（Vercel API）**:
  - `api/_lib/stripe.js`

### 新しいキーの発行方法
1. Stripe Dashboard → Developers → API Keys
2. Secret key の「Roll key」をクリック
3. 有効期限を設定（即時 or 24時間後に旧キー失効）
4. 新しいキーをコピー

### 差し替え手順
1. Stripe Dashboardで新キーを発行（上記）
2. Supabase Dashboard → Edge Functions → Secrets で `STRIPE_SECRET_KEY` を更新:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_新しいキー --project-ref iikwusprydaogzeslgdz
   ```
3. Vercel Dashboard → Environment Variables → `STRIPE_SECRET_KEY` を更新
4. `vercel --prod` で再デプロイ

### 動作確認
- テスト注文で決済が完了すること
- Stripe Dashboardでイベントログにエラーがないこと

---

## 5. Stripe Publishable Key

### 保存場所
- **フロントエンドHTML**: `weir-order-checkout.html`（Stripe.js初期化で使用）

### 新しいキーの発行方法
1. Stripe Dashboard → Developers → API Keys
2. Publishable key の「Roll key」をクリック
3. 新しいキーをコピー

### 差し替え手順
1. `weir-order-checkout.html` で `pk_test_` または `pk_live_` で始まるキーを検索
2. 新しいキーに置換
3. `vercel --prod` で再デプロイ

### 動作確認
- チェックアウト画面でStripe決済フォームが表示されること
- テスト決済が成功すること

---

## 6. ANTHROPIC_API_KEY

### 保存場所
- **Vercel環境変数**: `ANTHROPIC_API_KEY`（現在未設定）

### 新しいキーの発行方法
1. Anthropic Console (https://console.anthropic.com/) にログイン
2. Settings → API Keys → 「Create Key」
3. キー名を入力（例: `aiden-prod`）
4. 生成されたキーをコピー

### 設定・変更手順
1. Vercel Dashboard → Settings → Environment Variables
2. `ANTHROPIC_API_KEY` を追加/更新
3. `vercel --prod` で再デプロイ

### 動作確認
- AI機能（レビュー返信生成、SNS投稿生成）が正常動作すること

---

## 7. OPENAI_API_KEY

### 保存場所
- **Vercel環境変数**: `OPENAI_API_KEY`（現在未設定）

### 新しいキーの発行方法
1. OpenAI Platform (https://platform.openai.com/) にログイン
2. API Keys → 「Create new secret key」
3. キー名を入力（例: `aiden-prod`）
4. 生成されたキーをコピー

### 設定・変更手順
1. Vercel Dashboard → Settings → Environment Variables
2. `OPENAI_API_KEY` を追加/更新
3. `vercel --prod` で再デプロイ

### 動作確認
- POP画像生成（DALL-E）が正常動作すること

---

## 補足: その他のシークレット

以下のキーもSupabase Edge Functions Secretsに保存されている:

| キー名 | 用途 | 使用Function |
|--------|------|-------------|
| `LINE_CHANNEL_ID` | LINE OAuth認証 | line-auth-redirect, line-auth-callback |
| `LINE_CHANNEL_SECRET` | LINE OAuth認証 | line-auth-callback |
| `RESEND_API_KEY` | メール送信 | send-order-email, send-invoice-email |
| `GOOGLE_MAPS_API_KEY` | Googleレビュー収集 | google-reviews-collector, google-places-background-collector |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook検証 | api/payments/webhook.js (Vercel環境変数) |

これらのローテーション手順はStripe Secret Keyと同様のパターン:
1. 各サービスのダッシュボードで新キー発行
2. `supabase secrets set キー名=新キー --project-ref iikwusprydaogzeslgdz`
3. 必要に応じて `vercel --prod` で再デプロイ

---

## 緊急時の対応フロー

1. **漏洩を検知**: どのキーが漏洩したか特定
2. **即座にキーを無効化**: 各サービスのダッシュボードで旧キーをRevoke/Roll
3. **新キーを発行**: 上記の各セクションの手順に従う
4. **差し替え**: 保存場所すべてに新キーを反映
5. **再デプロイ**: `vercel --prod`
6. **動作確認**: 各機能が正常動作すること
7. **監査ログ確認**: 不正利用の痕跡がないか確認
