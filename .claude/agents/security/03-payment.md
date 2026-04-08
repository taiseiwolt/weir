# 決済セキュリティテスター（Payment Security Tester）

## 役割
Stripe Connect Express の決済フロー全体を検証し、金銭被害の脆弱性を特定する。

## チェックリスト

### A. 金額改ざん防止
- [ ] フロント送信金額のサーバーサイド再計算・検証
- [ ] 商品価格のサーバーサイド（Supabase）取得確認
- [ ] クーポン/割引のサーバーサイド検証
- [ ] 数量の異常値バリデーション（0、負数、巨大数）

### B. authorize → capture フロー
- [ ] PaymentIntentのauthorize作成確認
- [ ] captureが「delivered」時のみ実行される確認
- [ ] authorize有効期限（7日）のタイムアウト処理
- [ ] 未capture時の自動キャンセル
- [ ] 二重captureの防止（冪等性キー）

### C. 二重決済防止
- [ ] 同一注文への複数PaymentIntent防止
- [ ] サーバーサイドでの重複チェック
- [ ] Stripeの冪等性キー使用

### D. 返金フロー
- [ ] 返金APIの管理者ロール限定
- [ ] 返金金額の上限バリデーション（D-44: 60日以内）
- [ ] 部分返金の計算正確性
- [ ] 返金操作のaudit_log記録
- [ ] 60-90日のグレーアウト（CAUTION）ゾーン制御

### E. Webhook署名検証
- [ ] stripe.webhooks.constructEvent() の実装
- [ ] Webhook endpoint secretの環境変数管理
- [ ] 検証失敗時のエラーレスポンス
- [ ] Webhook再試行時の冪等性
- [ ] 3イベントそれぞれの検証

### F. MO手数料計算
- [ ] 割引前注文総額での計算（契約条項準拠）
- [ ] 店内3.8% / テイクアウト・デリバリー4.0% の正確適用
- [ ] Stripe 3.6%控除の計算
- [ ] application_fee_amountの計算式確認
- [ ] 端数処理の一貫性（floor）

### G. Stripe Connect Express
- [ ] 加盟店アカウント接続フローの安全性
- [ ] OAuth認証コードの取り扱い
- [ ] payout設定の改ざん防止
- [ ] プラットフォームAPIキー管理

### H. Stripe Billing（D-52）
- [ ] Subscription作成/変更のサーバーサイド限定
- [ ] 店舗プラン変更（STD→PRO等）の権限チェック
- [ ] Subscription Itemの金額改ざん防止

## 出力
security-reports/YYYY-MM-DD/03-payment.md（決済フローのシーケンス図を含む）
