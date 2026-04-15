# 公開面テスター（Public Surface Tester）セキュリティテストレポート

**実行日**: 2026-04-08
**対象リポジトリ**: github.com/taiseiwolt/aiden-demo + github.com/taiseiwolt/aiden-pos
**対象コミット**: dfc961121447fdd0c593b6f269cead14e20df1a2

## サマリ
- チェック項目数: 42
- 問題なし: 21
- 要改善（P2/P3）: 5
- 脆弱性あり（P0/P1）: 8

---

## 発見事項

### P0/P1（即時対応）

#### P0-1: Stored XSS via body_html — DOMへの生HTMLインジェクション
- **対象**: `brand-news-detail.html` line 234
- **内容**: `bodyEl.innerHTML = article.body_html;` — `brand_news`テーブルの`body_html`フィールドがサニタイズなしでDOMに挿入されている。管理者（またはDBに書き込み可能な者）が`<script>alert('XSS')</script>`を挿入すると、全訪問者のブラウザで実行される。
- **再現手順**: brand_newsテーブルのbody_htmlカラムにスクリプトタグを含むHTMLを挿入 → brand-news-detail.htmlにアクセス
- **影響**: 全訪問者のセッションハイジャック、Cookie窃取、フィッシング
- **修正方針**: DOMPurifyライブラリを導入し、`bodyEl.innerHTML = DOMPurify.sanitize(article.body_html);` とする
- **フェーズ影響**: Phase 1（現在）

#### P0-2: 管理画面（weir-admin.html）にロールベースアクセス制御なし
- **対象**: `weir-admin.html` lines 237-240
- **内容**: 認証チェックが `if(!session){window.location.href='/';return;}` のみで、ユーザーが管理者かどうかの検証なし。チェックアウトページで登録したエンドユーザーでも管理画面にアクセス可能。
- **再現手順**: エンドユーザーとしてサインアップ → `weir-admin.html`に直接アクセス
- **影響**: 全テナントの企業・ブランド・店舗・スタッフ情報の閲覧。実際のデータアクセスはRLSに依存するが、フロントエンドの防御がゼロ。
- **修正方針**: セッション確認後に`staff_accounts`テーブルで適切なロールを確認してからレンダリングする
- **フェーズ影響**: Phase 1

#### P0-3: 管理画面がanon keyで機密操作を実行
- **対象**: `weir-admin.html` line 278
- **内容**: `headers: { 'Authorization': 'Bearer ' + SUPABASE_KEY }` — 一部のAPI呼び出しでセッショントークンではなくanon keyを使用。Bearerトークンの存在のみをチェックするサーバーレス関数では実質認証なし。
- **影響**: `bulk-send-verification`等のエンドポイントが認証なしで呼び出し可能
- **修正方針**: `session.access_token`を使用する
- **フェーズ影響**: Phase 1

#### P1-1: 複数ファイルでinnerHTMLにescH()未適用
- **対象**:
  - `aiden-brand-sushiro-v4.5.html` line 863: `logoTextValue`/`name`未エスケープ
  - `weir-order-checkout.html` line 1208: `item.img`がsessionStorageから取得（DB由来）、`" onerror="alert(1)`で攻撃可能
  - `aiden-store-v5.4.html` line 1126: `encodeURI`使用（HTML属性コンテキストでは不十分）
- **影響**: DB経由のReflected/Stored XSS
- **修正方針**: 全箇所でescH()を適用
- **フェーズ影響**: Phase 1

#### P1-2: robots.txtが存在しない
- **対象**: プロジェクトルート
- **内容**: 検索エンジンが`weir-admin.html`、`weir-customer-admin.html`、`weir-order-dashboard.html`をインデックス可能
- **影響**: アプリケーション構造の露出、標的型攻撃の容易化
- **修正方針**: `robots.txt`を追加し管理画面URLをDisallow
- **フェーズ影響**: Phase 1

#### P1-3: セキュリティヘッダーの欠如（vercel.json）
- **対象**: `vercel.json`
- **内容**: CSPは設定済みだが、X-Frame-Options、X-Content-Type-Options、HSTS、Referrer-Policyが未設定
- **影響**: クリックジャッキング、MIMEスニッフィング、HTTPS未強制
- **修正方針**: vercel.jsonのheadersセクションに追加
- **フェーズ影響**: Phase 1

#### P1-4: 認証トークンがlocalStorageに保存
- **対象**: `weir-order-dashboard.html` line 641, `weir-store.html` line 1036, `weir-order-tracking.html` line 251
- **内容**: `localStorage.getItem('weir_token')` — XSSが存在する場合、トークンが容易に窃取可能
- **影響**: セッションハイジャック（XSSとの組み合わせ）
- **修正方針**: Supabase組み込みのセッション管理を使用する
- **フェーズ影響**: Phase 1

#### P1-5: CSPが'unsafe-inline'を許可
- **対象**: `vercel.json` line 32
- **内容**: `script-src 'self' 'unsafe-inline'` — インラインスクリプトが必要な現行アーキテクチャの制約だが、CSPによるXSS防御を実質無効化
- **影響**: XSS保護の低下
- **修正方針**: 長期的にはnonce-basedのCSPへ移行
- **フェーズ影響**: Phase 2以降

---

### P2/P3（計画的対応）

#### P2-1: 本番コードにconsole.log/warn/error残存（139箇所）
- **対象**: 30ファイル（weir-customer-admin.html: 38件、weir-order-checkout.html: 14件等）
- **影響**: ブラウザコンソール経由の内部情報漏洩
- **修正方針**: `npm run lint`で検出・削除
- **フェーズ影響**: Phase 1

#### P2-2: Stripe publishable key (pk_live) のHTMLハードコード
- **対象**: `weir-order-checkout.html` line 761
- **内容**: `const STRIPE_PK = 'pk_live_51TAi...'` — publishable keyは公開前提だが、環境分離なし
- **修正方針**: 環境変数化
- **フェーズ影響**: Phase 1

#### P2-3: Edge Function呼び出しにanon keyをBearer使用
- **対象**: `weir-order-checkout.html`, `weir-customer-admin.html`, `weir-order-dashboard.html`の複数箇所
- **内容**: ユーザーのsession.access_tokenではなくSUPABASE_KEY（anon key）をAuthorizationヘッダーに使用
- **修正方針**: `session.access_token`を使用
- **フェーズ影響**: Phase 1

#### P2-4: ゲストPIIのsessionStorage保存
- **対象**: 複数ファイル
- **内容**: `weir_member_id`がsessionStorage/localStorageに保存。UUIDで直接PIIではないが、PII検索に使用可能
- **フェーズ影響**: Phase 1

#### P3-1: CSRF保護なし（低リスク）
- **対象**: 注文チェックアウト、ログインフォーム
- **内容**: CSRFトークンなし。JWT Bearer認証のためリスクは限定的
- **フェーズ影響**: Phase 1

---

### 問題なし
- escH()関数: 主要ファイルに定義・使用されている
- シークレットキー（sk_live等）: フロントエンドに露出なし
- .envファイル: .gitignoreに含まれている
- eval()/new Function(): 使用なし
- document.cookie: アクセスなし
- OGPタグ: 静的（ユーザー入力由来でない）
- サイトマップ: 管理画面URLを含まない
- サーバーサイドJS: process.envで秘密情報を管理
