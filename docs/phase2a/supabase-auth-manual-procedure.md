# Phase 2-a Supabase Auth 設定 — Taisei 手動手順書

> **対象**: Supabase Dashboard の Auth 設定（Site URL / Redirect URLs / Email Templates）
> **実施時期**: feature/phase2a-url-refactor を main にマージした後
> **所要時間**: 約 5-10 分

---

## 調査結果サマリ（Q-7対応）

Weir コード内の Supabase Auth redirect URL 指定箇所を網羅調査した結果：

### 結論: コード変更のみでほぼ完結、Dashboard での軽微な追加設定が必要

- **ケース1 (コード側 `redirectTo` 指定)**: 6箇所すべて Phase 2-a の新URLに更新済み
  - `api/members/[...path].js` L234, L798, L865, L957 — Task 9 で更新
  - `api/members/[...path].js` L282, L872 — `redirectUrl` 変数経由で自動更新
  - `weir-order-checkout.html` L2458 — Task 11 で更新（/weir-mypage.html → /reset-password）
- **ケース2 (Supabase Email Templates ハードコード)**: 該当なし
  - Email Templates の URL は Supabase が自動生成（`{{ .ConfirmationURL }}` placeholder 使用）
  - URL の base は Dashboard 「Site URL」から派生
  - テンプレート自体に xorder.co.jp/weir-*.html の直接ハードコードはない（要目視確認）

---

## Taisei 手動実行手順

### STEP 1: Site URL 確認

**Supabase Dashboard → Authentication → URL Configuration → Site URL**

- 期待値: `https://xorder.co.jp`
- 異なる値（例: 旧 `https://aiden-demo.vercel.app` / `https://weir.vercel.app`）ならば `https://xorder.co.jp` に更新する

### STEP 2: Redirect URLs (Additional) に Phase 2-a パスを追加

**Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**

現在のリストに以下が含まれているか確認、**不足分を追加**:

```
https://xorder.co.jp/**
https://xorder.co.jp/verify-email
https://xorder.co.jp/verify-email/pending
https://xorder.co.jp/reset-password
https://xorder.co.jp/legal/**
```

**注**: `**` は wildcard。すべての brand/venue 配下のパス（例: `/izakaya-ushio/mypage`）を許可する。Supabase は explicit match + wildcard match の両方をサポートする。

**後方互換のため、以下も残しておく**（既存のブックマーク・古いリンクからの遷移対応）:

```
https://xorder.co.jp/weir-email-verified.html
https://xorder.co.jp/weir-password-reset.html
https://xorder.co.jp/weir-mypage.html
https://xorder.co.jp/weir-order-checkout.html
```

**vercel preview / localhost (dev 用)**:

```
https://weir.vercel.app/**
http://localhost:3000/**
```

### STEP 3: Email Templates の URL base 確認

**Supabase Dashboard → Authentication → Email Templates → （各テンプレート）**

テンプレート:
1. Confirm signup
2. Invite user
3. Magic Link
4. Change Email Address
5. Reset Password

**確認事項**: 各テンプレート本文に `{{ .ConfirmationURL }}` placeholder があり、**直接 URL のハードコードがない**ことを確認。

- もし `https://xorder.co.jp/weir-email-verified.html?...` のような直接ハードコードがあれば、`{{ .ConfirmationURL }}` に置き換える
- 通常は Supabase デフォルトのまま使用しているはずなので、ハードコードはない見込み

**補足**: `{{ .ConfirmationURL }}` は:
- Confirm signup: `{SITE_URL}/auth/v1/verify?token=...&type=signup&redirect_to=<redirectTo>`
- Reset Password: `{SITE_URL}/auth/v1/verify?token=...&type=recovery&redirect_to=<redirectTo>`
- コード側の `redirectTo` が挿入されるので、Phase 2-a の `/verify-email` / `/reset-password` に正しくリダイレクトされる

### STEP 4: 動作確認

以下のフローでメールリンクが正しいURL に到達するか手動確認:

1. **サインアップ確認メール**:
   - 未ログイン状態で新規会員登録
   - 届いたメール内「メール認証を完了する」リンクをクリック
   - → `https://xorder.co.jp/verify-email` にランディング
   - 確認成功画面が表示されればOK

2. **パスワードリセットメール**:
   - checkout ページで「パスワードを忘れた」クリック
   - 届いたメール内「パスワードをリセットする」リンクをクリック
   - → `https://xorder.co.jp/reset-password#access_token=...&type=recovery` にランディング
   - パスワード再設定フォームが表示されればOK

### STEP 5: 旧URLへのブックマーク対応（オプション）

古いブックマークやSNS投稿の旧URLからのアクセス対応は **middleware.js の Task 12 301 リダイレクト**で対応される。Supabase Dashboard 側の追加作業は不要。

---

## トラブルシューティング

### Q: 認証メールのリンクが `/weir-email-verified.html?error=...` に飛ぶ

- **原因**: コード側 `redirectTo` で旧URLが指定されているか、Dashboard の Redirect URLs リストに新URLが未登録
- **確認**: `grep -r "redirectTo" api/ weir-*.html supabase/functions/` で旧URL（`weir-*.html`）が残っていないか確認
- **対処**: STEP 2 の Redirect URLs に新パス追加

### Q: パスワードリセットリンクが `/reset-password#error=otp_expired`

- **原因**: メールリンクの有効期限切れ。Dashboard 設定とは無関係
- **対処**: 再送信（通常60分で expire）

### Q: OAuth（LINE）ログイン後に checkout 画面に戻らない

- **原因**: Phase 2-a Task 9 の TODO 対象。OAuth state param 未実装のため brand/venue 文脈が保持されない
- **対処**: 現状は `/weir-order-checkout.html` へランディング（Vercel filesystem serving）し動作する。Phase 2-b で state param 対応予定

---

## 参照コード

- `api/members/[...path].js` L630-740: LINE OAuth callback
- `api/members/[...path].js` L950-965: `resetPasswordForEmail` 呼び出し
- `weir-order-checkout.html` L2452-2467: `handleForgotPassword`
- `supabase/functions/line-auth-callback/index.ts` L115-160: LINE 認証 magic link 生成

## 完了チェックリスト

- [ ] STEP 1: Site URL = `https://xorder.co.jp` を確認
- [ ] STEP 2: Redirect URLs に `/verify-email`, `/verify-email/pending`, `/reset-password`, `/legal/**`, `/**` 追加
- [ ] STEP 3: Email Templates に URL ハードコードがないことを確認
- [ ] STEP 4: サインアップ確認メール + パスワードリセットメールの実機確認
- [ ] 結果を aiden-decisions-index.md の D-xxx に追記
