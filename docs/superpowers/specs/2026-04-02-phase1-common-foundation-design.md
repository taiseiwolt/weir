# Phase 1: 全ページ共通基盤 — 設計スペック

**Date:** 2026-04-02
**Status:** Approved
**Scope:** FOUC修正、共通CSS/JS抽出、i18n統一、ヘッダー/フッター共通化

---

## 1. ファイル構成

```
aiden-demo/
├── aiden-common.css      # 共通スタイル
├── aiden-common.js       # 共通ロジック
```

各HTMLの `<head>` 末尾（Supabase CDN の後）に追加:
```html
<link rel="stylesheet" href="./aiden-common.css">
<script src="./aiden-common.js"></script>
```

## 2. FOUC制御

### CSS (aiden-common.css)
```css
body:not(.aiden-ready) { opacity: 0; }
body.aiden-ready { opacity: 1; transition: opacity .3s ease; }
```

### JS (aiden-common.js)
- `AidenCommon.init()` 完了時に `document.body.classList.add('aiden-ready')` でフェードイン
- **タイムアウト: 3秒**でSupabase応答がない場合は強制表示
- タイムアウト時のカラー: **ニュートラル（白/グレー系）** — ブランドカラーは適用しない
  - `--brand-primary: #666`, `--brand-header-bg: #FFFFFF`, `--brand-header-text: #333`
  - これによりカスタムドメインアクセス時に炭火亭色が表示される問題を回避

### タイムアウトフロー
```
ページ読込 → body opacity:0
  ├─ Supabase応答OK → ブランドカラー適用 → aiden-ready
  └─ 3秒タイムアウト → ニュートラルカラー適用 → aiden-ready
       └─ その後Supabase応答が来たら → ブランドカラーで上書き（シームレス）
```

## 3. AidenCommon API設計

```javascript
window.AidenCommon = {
  // 初期化（各ページから呼び出し）
  async init(options) {},
  // options: {
  //   header: 'brand' | 'order' | false,  // ヘッダーバリアント
  //   footer: true | false,                // フッター注入
  //   onBrandLoaded: function(brand) {},   // ブランドデータ取得後コールバック
  // }

  // ブランドID解決
  async resolveBrandId() {},

  // ブランドデータ取得 + CSS変数適用
  async loadBrand(brandId) {},

  // i18n
  I18N: {},                              // 共通翻訳辞書
  addTranslations(dict) {},              // ページ固有翻訳を追加
  changeLang(lang) {},                   // 言語切替
  t(key) {},                             // 翻訳取得ヘルパー

  // ヘッダー/フッター生成
  renderHeader(type, brand) {},
  renderFooter(brand) {},

  // ユーティリティ
  escH(s) {},                            // XSSエスケープ
  brand: null,                           // 取得済みブランドデータ
  lang: 'ja',                            // 現在の言語
};
```

## 4. ブランドデータ読込

### resolveBrandId() — 優先順位
1. カスタムドメイン照合 (`brands.custom_domain`)
2. `?brand=` URLパラメータ (slug)
3. store slugプレフィックス照合
4. `sessionStorage.getItem('aiden_brand_id')`
5. `DEFAULT_BRAND_ID` (炭火亭)

### loadBrand(brandId) — 取得カラム
`brands` テーブルから:
```
id, name, slug, memo, font_family, font_color,
primary_color, primary_dark, primary_light,
header_bg, header_text_color,
logo_mark_type, logo_mark_emoji, logo_mark_src,
logo_text_type, logo_text_value,
sns_line, sns_x, sns_instagram, sns_facebook, sns_tiktok, sns_youtube, sns_threads,
company_url, recruit_url,
hero_catchphrase, brand_description, custom_domain
```

### CSS変数マッピング
```
primary_color    → --brand-primary
primary_dark     → --brand-primary-dark
primary_light    → --brand-primary-light
header_bg        → --brand-header-bg
header_text_color → --brand-header-text
font_family      → --brand-font
font_color       → --brand-font-color
```

## 5. ヘッダーコンポーネント

### Type A: ブランドページ用 (header: 'brand')
対象: brand.html, aiden-brand-menu.html, aiden-brand-stores.html, aiden-membership.html

構造（brand.htmlの現在の実装を共通化）:
- ブランドカラー背景 `var(--brand-header-bg)`
- 高さ56px, sticky, z-index:1000
- ロゴ（テキスト or 画像）
- ナビリンク: メニュー / お店を探す / 会員特典 / 来店予約(CTA) / お持ち帰り・デリバリー(CTA)
- 言語セレクト（7言語）
- ハンバーガーメニュー（モバイル）
- モバイルナビ: CTAグリッド + ナビリンク

ナビリンクのURL:
- `./aiden-brand-menu.html?brand={slug}`
- `./aiden-brand-stores.html?brand={slug}`
- `./aiden-membership.html?brand_id={id}`
- `./aiden-order.html?brand={slug}` (MO)

アクティブリンク: 現在のページに対応するリンクに `.active` クラスを付与。
判定は `location.pathname` から。

### Type B: MOページ用 (header: 'order')
対象: aiden-order.html, aiden-order-store.html, aiden-order-checkout.html

構造:
- ブランドカラー背景 `var(--brand-header-bg)`（現在の白→変更）
- 高さ56px, fixed, z-index:200
- 左: 戻るボタン（←）— `history.back()` or ページ固有のコールバック
- 中央: ブランドロゴ（テキスト or 画像）
- 右: カートアイコン（バッジ付き）+ サインインボタン + 言語セレクト
- テキスト色: `var(--brand-header-text)`

戻るボタンの挙動:
- aiden-order.html: 非表示 or ブランドHPへ
- aiden-order-store.html: 店舗選択ページへ
- aiden-order-checkout.html: メニュー選択ページへ

### 共通CSS (aiden-common.css)
ヘッダーのCSSはType A / Type Bともに aiden-common.css に含める。
各HTMLファイルから重複するヘッダーCSSを削除する。

## 6. フッターコンポーネント

全ページ統一。brand.htmlの現在の構造を共通化:

### 構造
- 背景: `var(--brand-primary-dark)` or ダークグレー
- 5カラム (PC) → 2カラム (タブレット) → 1カラム (モバイル)
  1. ブランドロゴ + 説明文
  2. メニューリンク（グランドメニュー / 焼肉・特選肉 / ご飯・麺 / ドリンク / コース・プラン）
  3. サービスリンク（来店予約 / お持ち帰り / デリバリー / 会員特典）
  4. 会社情報（動的 — company_url / recruit_url がある場合のみ表示）
  5. ニュース・キャンペーン

### 下部バー
- コピーライト `© {year} {brandName}`
- 法務リンク: 特定商取引法 / プライバシーポリシー / 利用規約 / 返金ポリシー / サイトマップ / お問い合わせ
- Powered by AIden バッジ

### 注意
- フッターのメニューリンクはブランド固有のカテゴリ名になる可能性があるが、Phase 1ではbrand.htmlの現在のハードコード値を維持。Phase 2でDB連動に変更。

## 7. i18n統一

### 方式
- `data-i18n` 属性 + `querySelectorAll('[data-i18n]')` に統一
- aiden-order.html の `getElementById` 方式は `data-i18n` に移行

### 翻訳辞書
- **共通辞書** (`AidenCommon.I18N`): ヘッダー/フッター/共通UIの翻訳（7言語）
- **ページ固有辞書**: 各ページから `AidenCommon.addTranslations()` で追加
- 言語: ja / en / zh / ko / fr / it / id

### 言語の永続化
- `sessionStorage.setItem('aiden_lang', lang)` で保存
- ページ読込時に `sessionStorage.getItem('aiden_lang')` を参照
- デフォルト: `ja`

### changeLang(lang) 統一実装
1. `AidenCommon.lang = lang`
2. `sessionStorage.setItem('aiden_lang', lang)`
3. `document.querySelectorAll('[data-i18n]')` を走査 → `textContent` or `innerHTML` を設定
4. `document.querySelectorAll('[data-i18n-placeholder]')` を走査 → `placeholder` を設定
5. `document.getElementById('html-root').lang = lang` (html-root IDがある場合)
6. 言語セレクトの選択値を同期

## 8. 対象ページと変更サマリ

| # | ページ | 削除 | 追加 |
|---|--------|------|------|
| 1 | brand.html | ヘッダー/フッターHTML、CSS変数デフォルト値、`applyBrandConfig()`の一部、`changeLang()`、`I18N`辞書、`escH()` | `<link>`+`<script>` 読込、`AidenCommon.init({header:'brand',footer:true})` 呼出、ページ固有翻訳 |
| 2 | aiden-brand-menu.html | 同上 | 同上 |
| 3 | aiden-brand-stores.html | 同上 | 同上 |
| 4 | aiden-membership.html | 独自ヘッダー、CSS変数、ブランド読込全体 | 共通読込、i18n対応追加（新規）、ヘッダー/フッター |
| 5 | aiden-order.html | 独自ヘッダー、`LNG`辞書、`changeLang()` | 共通読込、Supabase初期化追加、`data-i18n`属性付与 |
| 6 | aiden-order-store.html | 独自ヘッダー、ブランド色個別適用 | 共通読込、フッター追加 |
| 7 | aiden-order-checkout.html | 独自ヘッダー、独自FOUC制御、`I18N`辞書 | 共通読込、フッター追加 |

## 9. 制約・前提

- **HP修正の12タスク完了後に開始** — brand.htmlの構造が確定してから着手
- **各ページ固有ロジックには手を入れない** — ヒーローカルーセル、メニュー表示、地図、決済フロー等
- **Supabase `sb` 変数は各ページで維持** — クエリパターンが異なるため共通化しない
- **Phase 1完了後に全ページリグレッション確認を実施**
- **aiden-order.htmlのハードコード店舗リスト→Supabase化はPhase 2で対応**

## 10. リグレッション確認項目

Phase 1完了後に以下を確認:
1. 全7ページが正常に表示される（FOUC なし）
2. ブランドカラーが正しく適用される
3. ヘッダーナビのリンクが全ページで正しく動作する
4. モバイルハンバーガーメニューが動作する
5. 言語切替が全ページで機能し、ページ遷移後も言語が維持される
6. フッターが全ページで統一表示される
7. brand.htmlのHP固有機能（カルーセル、キャンペーン、ニュース等）が壊れていない
8. MO注文フロー（店舗選択→メニュー→決済）が正常に動作する
9. カート・サインイン等のMO固有UIが機能する
10. タイムアウト時にニュートラルカラーで表示される
