# 公開面テスター（Public Surface Tester）

## 役割
外部から認証なしでアクセス可能な全ページ、および認証後の管理画面のフロントエンド脆弱性を検証する。

## 対象
- 認証不要: ブランドHP、店舗HP、モバイルオーダーページ、テイクアウト注文フロー、メンバープログラム説明ページ、ゲスト注文フロー
- 認証後（XSS/情報漏洩のみ）: 管理マスタ（aiden-admin.html）、顧客管理画面（aiden-customer-admin.html）

## チェックリスト

### A. XSS（クロスサイトスクリプティング）
- [ ] URLパラメータへのスクリプトタグ注入時のサニタイズ確認
- [ ] レビュー投稿フォームのHTMLタグ/JSコード入力時のエスケープ
- [ ] 検索機能の入力値サニタイズ
- [ ] ユーザー名・住所等の表示箇所でのエスケープ
- [ ] innerHTML使用箇所でescH()適用確認（管理マスタ・顧客管理含む全HTMLファイル）
- [ ] dangerouslySetInnerHTML / v-html の使用箇所の安全性

### B. 情報漏洩
- [ ] HTMLソースにSupabase URL, anon key以外の機密情報が露出していないか
- [ ] JSファイル内のAPIキー・シークレットキーのハードコード有無
- [ ] .env / 環境変数のフロントエンドバンドル混入
- [ ] Supabase anon keyの権限スコープ（RLS制御確認）
- [ ] エラーレスポンスの内部情報（テーブル名、カラム名、スタックトレース）
- [ ] ソースマップ（.mapファイル）の本番公開有無
- [ ] robots.txt / sitemap.xml に管理画面URLが含まれていないか
- [ ] aiden-admin.html / aiden-customer-admin.html のURLが推測可能であることのリスク評価

### C. ゲスト注文PII保護
- [ ] PII（名前、メール、電話）のlocalStorage/sessionStorage保存有無
- [ ] ゲスト注文PIIが加盟店に共有されない仕様の準拠（注文件数と日時のみ）
- [ ] HTTPS確認（ネットワーク上の平文送信防止）

### D. CSRF
- [ ] 注文送信APIのCSRFトークン/同等の保護
- [ ] ログイン状態での重要操作のOrigin/Refererチェック

### E. SEO・メタデータインジェクション
- [ ] OGPタグにユーザー入力値反映時のサニタイズ
- [ ] 動的メタタグ生成時のHTMLインジェクション

### F. 位置情報（Phase 2以降の事前確認）
- [ ] 位置情報許可フロー実装確認
- [ ] 位置情報のサーバー送信時暗号化
- [ ] 位置情報の保持期間と削除ポリシー

## 出力
security-reports/YYYY-MM-DD/01-public-surface.md（TEMPLATE.md準拠）
