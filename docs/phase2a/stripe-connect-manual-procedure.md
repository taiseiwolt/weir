# Phase 2-a Stripe Connect 設定 — Taisei 手動手順書

> **対象**: Stripe Dashboard の Stripe Connect Express 設定（Return URL / Refresh URL）
> **実施時期**: feature/phase2a-url-refactor を main にマージした後
> **所要時間**: 約 3-5 分

---

## 背景

Phase 2-a で Weir の顧客向け URL 構造が `/{brand_slug}/...` 形式に変更された。Stripe Connect Express のオンボーディング（法人が Weir にサインアップして Stripe アカウントを接続するフロー）で、以下 2 つの URL が設定されている：

- **Return URL**: Stripe オンボーディング完了後に Weir に戻る先
- **Refresh URL**: オンボーディング途中でセッション切れたら再開する先

これらは **管理画面側の URL**（merchant-facing、`admin.weir.co.jp` ドメイン）。Phase 2-a の customer-facing URL 変更 (`xorder.co.jp`) とは別ドメインであり、**原則として Phase 2-a による直接の影響は受けない**。ただし設定の再確認と、将来の変更タイミングをドキュメント化しておく。

---

## 調査結果サマリ

Weir コード内の Stripe Connect onboarding 呼び出し箇所:

```
api/admin/[...path].js (または同等)
  → stripe.accountLinks.create({
      type: 'account_onboarding',
      return_url: ...,
      refresh_url: ...,
    })
```

- `return_url`: 通常は `https://admin.weir.co.jp/stripe-connect-complete?...` またはこれに類する admin URL
- `refresh_url`: 通常は `https://admin.weir.co.jp/stripe-connect-onboarding?...` またはこれに類する admin URL

Phase 2-a で **customer-facing URL のみ**変更しており、**admin URL は変更していない**ため、コード側の `return_url`/`refresh_url` 指定は **変更不要**。

---

## Taisei 手動実行手順

### STEP 1: コード側の URL を確認（変更不要確認）

**作業ディレクトリ**: `/Users/taisei/Desktop/weir` （main branch、Phase 2-a マージ後）

```bash
grep -rn "return_url\|refresh_url" api/ --include='*.js'
```

期待結果：
- 該当箇所の URL が `admin.weir.co.jp` または `xorder.co.jp/weir-admin.html#...` を指している
- `weir-order-checkout.html` などの **customer-facing URL** ではない

customer-facing URL が混在している場合は、それらを admin URL に直すこと（別 CC 依頼扱い）。

### STEP 2: Stripe Dashboard で Connect 設定を確認

**Stripe Dashboard → Settings → Connect → Settings**

確認項目：
1. **Platform settings**:
   - Platform name: `Weir`（または `Aiden`→ `Weir` 遷移で未更新なら更新）
   - Support email: 適切なサポート窓口
2. **Branding**:
   - Logo: Weir ロゴ（AIden ロゴが残っていれば差し替え）
   - Brand color: `#D32F2F`（Weir の primary）
3. **Redirect URIs (Connect OAuth を使う場合のみ)**:
   - **通常は Stripe Connect Express では不要**（account_links.create で動的に URL を生成するため）
   - もし設定されているなら、`https://admin.weir.co.jp/*` を含めておく

### STEP 3: Webhook URL 確認（影響なし、念のため）

**Stripe Dashboard → Developers → Webhooks**

現在設定されている Webhook endpoint（3 イベント設定済みとの記載あり）：
- `https://xorder.co.jp/api/stripe-webhook`（または同等）

Phase 2-a で `/api/*` 配下の URL は**一切変更していない**ため、Webhook 設定は **そのまま動作する**。変更不要。

### STEP 4: 動作確認（実際に OAuth フローを通す）

**Sandbox モード推奨**。Production で試すと実データに影響する。

1. テスト法人（Stripe テストモード）を新規作成
2. Weir 管理画面から「Stripe アカウント接続」クリック
3. Stripe オンボーディング画面に遷移
4. 完了ボタンクリック
5. **期待**: `https://admin.weir.co.jp/...` にリダイレクトされる（コード側 `return_url`）

もし**想定外の URL に飛んだ場合**、`return_url`/`refresh_url` 指定を確認・修正する。

---

## 補足: Phase 2-b 以降の改善案

将来、**merchant 側も customer 側と同じ `xorder.co.jp` ドメイン配下で admin UI を配信する**方針に切り替える場合（例: `xorder.co.jp/merchant/...`）、以下を同時に更新する必要がある：

1. コード側 `return_url`/`refresh_url` の URL 書き換え
2. Stripe Dashboard の Redirect URIs（OAuth を使う場合）
3. Webhook endpoint 先の URL
4. vercel.json の rewrites に merchant 配下のルート追加
5. middleware.js の admin 判定ロジック更新

Phase 2-a ではこれらは**スコープ外**。現状維持で問題なし。

---

## トラブルシューティング

### Q: オンボーディング完了後、真っ白なページが表示される

- **原因 1**: `return_url` が不正（存在しないパス）
- **対処**: コード側の `return_url` 指定を確認、必要に応じて `https://admin.weir.co.jp/` に差し替え

### Q: Stripe Connect で「アカウントが見つかりません」エラー

- **原因**: Stripe アカウント作成時のメタデータに merchant_id が含まれていない、または DB の merchants.stripe_account_id 未設定
- **対処**: Phase 2-a とは別問題。api/admin/stripe-connect handler を確認

### Q: Webhook が届かない

- **原因**: Stripe Dashboard の Webhook URL が旧ドメイン（例: `aiden-demo.vercel.app`）のまま
- **対処**: Webhook URL を `https://xorder.co.jp/api/stripe-webhook` に更新

---

## 完了チェックリスト

- [ ] STEP 1: `grep` でコード側 `return_url`/`refresh_url` が admin URL を指していることを確認
- [ ] STEP 2: Stripe Dashboard の Connect 設定（Platform name / Branding）を Weir 表記に統一
- [ ] STEP 3: Webhook URL が `xorder.co.jp/api/stripe-webhook` を指していることを確認（変更不要確認）
- [ ] STEP 4: Sandbox で実際にオンボーディングフローを通す
- [ ] 結果を `aiden-decisions-index.md` の D-xxx に追記

---

## 参照ドキュメント

- Stripe Connect Express docs: https://stripe.com/docs/connect/express-accounts
- Stripe account_links API: https://stripe.com/docs/api/account_links/create
- Weir 関連 CC 依頼: `cc-requests/` 配下の Stripe 関連依頼

---

## ⚠️ 重要な注意

- **本番モードで Stripe 設定を触る際は、事前に必ず現在の設定をスクリーンショットで保存**
- **返金期間設定（90日）などのプラットフォーム設定は Phase 2-a とは無関係で触らない**
- **テストアカウントのオンボーディングが成功することを確認してから、本番切替**
