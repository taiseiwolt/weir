# Weir QA タスク一覧

---

## タスク1: ページ死活監視
**スケジュール:** 毎時
**ファイル名:** health-YYYY-MM-DD-HH.md

### 手順
1. 以下のURLにcurlでGETリクエストを送信し、HTTPステータスコードを記録する
   - https://xorder.co.jp/ （トップページ）
   - https://xorder.co.jp/weir-order-store.html （モバイルオーダー）
   - https://xorder.co.jp/weir-order-dashboard.html （受注ダッシュボード）
   - https://weir.co.j./weir-brand-sushiro.html （ブランドHP）
   - https://xorder.co.jp/weir-mypage.html （マイページ）
   - https://xorder.co.jp/api/health （APIヘルスチェック）
2. 各URLのステータスコードとレスポンスタイムを記録
3. 200以外のステータスコードがあれば 🔴Critical として記録

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/health-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: health-YYYY-MM-DD-HH.md」と出力して終了する

---

## タスク2: APIエンドポイント監視
**スケジュール:** 毎時
**ファイル名:** api-YYYY-MM-DD-HH.md

### 手順
1. 以下のAPIエンドポイントにcurlでリクエストを送信し、レスポンスを記録する
   - GET /api/health
   - GET /api/restaurants（店舗一覧）
   - GET /api/menu（メニュー一覧）
2. 各レスポンスの `success` フィールドを確認
3. エラーレスポンスや500エラーがあれば 🔴Critical として記録

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/api-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: api-YYYY-MM-DD-HH.md」と出力して終了する

---

## タスク3: DB整合性チェック
**スケジュール:** 6時間ごと
**ファイル名:** db-consistency-YYYY-MM-DD-HH.md

### 手順
1. Supabase REST APIでテーブル件数を確認する（anon keyでアクセス可能なテーブルのみ）
   - stores: `?select=id&limit=1&order=id` でヘッダーの Content-Range を確認
   - products: 同上
   - brands: 同上
2. 件数が前回と大きく変動していないか確認（前回レポートと比較）
3. 異常な変動があれば 🟡Warning として記録

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/db-consistency-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: db-consistency-YYYY-MM-DD-HH.md」と出力して終了する

---

## タスク4: Edge Function 動作確認
**スケジュール:** 6時間ごと
**ファイル名:** edge-functions-YYYY-MM-DD-HH.md

### 手順
1. 以下のEdge FunctionにcurlでGETリクエストを送信し、レスポンスを確認する
   - https://iikwusprydaogzeslgdz.supabase.co/functions/v1/confirm-order （POSTのみなのでMethodエラーが返ればOK）
   - https://iikwusprydaogzeslgdz.supabase.co/functions/v1/send-order-email （同上）
2. レスポンスが返ること自体を確認（関数がデプロイされているか）
3. タイムアウトやネットワークエラーがあれば 🔴Critical として記録

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/edge-functions-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: edge-functions-YYYY-MM-DD-HH.md」と出力して終了する

---

## タスク5: Stripe Webhook 確認
**スケジュール:** 12時間ごと
**ファイル名:** stripe-webhook-YYYY-MM-DD-HH.md

### 手順
1. Webhook受信エンドポイントの存在確認
   - curl -s -o /dev/null -w "%{http_code}" https://xorder.co.jp/api/payments/webhook
2. ローカルのWebhookハンドラーコード（api/payments/webhook.js）を読み取り、処理対象のイベント一覧を確認
3. 前回と比較して変更がないか確認

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/stripe-webhook-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: stripe-webhook-YYYY-MM-DD-HH.md」と出力して終了する

---

## タスク6: パフォーマンス監視
**スケジュール:** 12時間ごと
**ファイル名:** performance-YYYY-MM-DD-HH.md

### 手順
1. 主要ページのレスポンスタイムを計測する（curl -w で time_total を取得）
   - https://xorder.co.jp/
   - https://xorder.co.jp/weir-order-store.html
   - https://weir.co.j./weir-brand-sushiro.html
2. 各ページのレスポンスタイムを記録
3. 3秒以上のページがあれば 🟡Warning として記録
4. 5秒以上のページがあれば 🔴Critical として記録

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/performance-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: performance-YYYY-MM-DD-HH.md」と出力して終了する

---

## タスク7: セキュリティ定期チェック
**スケジュール:** 24時間ごと
**ファイル名:** security-YYYY-MM-DD-HH.md

### 手順
1. anon keyでのアクセス制御を確認する（RLSが機能しているか）
   - members テーブル: アクセスが拒否されるべき（空配列 or エラー）
   - stores テーブル: 公開データとしてアクセス可能であるべき
   - orders テーブル: アクセスが拒否されるべき
   - member_coupons テーブル: アクセスが拒否されるべき
2. HTTPSの確認: httpでアクセスした場合にhttpsへリダイレクトされるか
3. ローカルコードにハードコードされたシークレットがないか確認
   - HTMLファイル内の service_role キー
   - HTMLファイル内の Stripe Secret Key
   - `grep -r "sk_live\|service_role\|secret" ~/Desktop/aiden-demo/*.html` で検索
4. 問題があれば 🔴Critical として記録

### 完了手順
1. 上記チェックを全て実行する（確認不要、即実行）
2. 結果を ~/Desktop/aiden-demo/test-results/security-YYYY-MM-DD-HH.md に保存する
3. 「保存完了: security-YYYY-MM-DD-HH.md」と出力して終了する
