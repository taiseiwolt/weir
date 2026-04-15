# Weir Day 4 テスト依頼書

実行日: 2026-03-22
前提: Day 1〜3完了済み（セキュリティ修正・金額照合・バリデーション・タイマー等PASS）
対象: 通知（F）+ 顧客管理画面（G）+ 顧客管理→他画面反映（④）+ BMギャップ（G-13〜17）

---

## 接続情報

- GitHub: https://github.com/taiseiwolt/aiden-demo
- ローカルリポジトリ: ~/Desktop/aiden-demo
- 作業ディレクトリ（HTML）: ~/Desktop/aiden.html/
- 本番URL: https://weir.co.jp
- Supabase URL: https://iikwusprydaogzeslgdz.supabase.co
- Supabase Anon Key: sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC
- Supabase Legacy JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（Edge Function認証用）
- Access Token: sbp_0bc989fd83759e2909944e4a7117b341834c19b8（期限: 2026-04-15）

---

## テスト結果の記録ルール

- 全テスト結果を `~/Desktop/aiden-demo/test-results/day4-results.md` に記録
- 各テストに **PASS / FAIL / SKIP（理由）** を記載
- FAILの場合: 原因特定→修正→再テストまで実施。修正内容もday4-results.mdに記録
- 重要度: 🔴Critical / 🟡Warning / ℹ️Info
- テストで変更したDB/設定データは、各Phase終了時に元に戻すこと

---

## Phase 1: 顧客管理画面 基本動作テスト 🔴Critical

顧客管理画面（customer-admin）が正常に動作することを確認する。

### G-13: ログイン/ログアウトフロー
1. 顧客管理画面のURLを特定（HTMLファイル名を探索）
2. ログインフローを確認（メール+パスワード? Supabase Auth?）
3. ログイン成功 → ダッシュボード表示
4. ログアウト → ログイン画面に戻る
5. ログアウト後にURL直アクセス → ログイン画面にリダイレクト
- 重要度: 🔴Critical

### G-14: 複数店舗切替
1. ログイン後、店舗切替UIがあるか確認
2. 店舗Aを選択 → 店舗Aのデータ表示
3. 店舗Bに切替 → 店舗Bのデータ表示（店舗Aのデータが混在しないこと）
- 重要度: 🔴Critical
- **注**: テストデータに複数店舗が紐づいていない場合はSKIP

### CA-01: 画面一覧の確認
1. 顧客管理画面にどんなメニュー/セクションがあるか全体構造を記録
2. 各メニューをクリックして画面遷移するか確認
3. エラーやリンク切れがないか確認
- 重要度: 🔴Critical

---

## Phase 2: メニュー・商品管理テスト 🔴Critical

顧客管理画面での商品変更がEU注文画面に反映されるか確認する。

### C-01: 商品価格変更
1. customer-admin > メニュー管理 > 任意の商品の価格を変更（例: 1280円→1380円）
2. EU注文画面（aiden-order-store.html）を開く
3. 該当商品の価格が1380円で表示されるか確認
4. **テスト後: 価格を元に戻す（1280円）**
- 重要度: 🔴Critical

### C-02: 商品名変更
1. customer-admin > メニュー管理 > 任意の商品名を変更（例: 末尾に「テスト」追加）
2. EU注文画面で変更が反映されるか確認
3. **テスト後: 商品名を元に戻す**
- 重要度: 🟡Warning

### C-03: 商品追加
1. customer-admin > メニュー管理 > 新商品を追加（テスト商品: 名前「テスト商品」、価格500円）
2. EU注文画面に新商品が表示されるか確認
3. **テスト後: テスト商品を削除/非公開にする**
- 重要度: 🔴Critical

### C-04: 商品非公開
1. customer-admin > メニュー管理 > 任意の商品を非公開設定
2. EU注文画面から該当商品が消えるか確認
3. **テスト後: 公開に戻す**
- 重要度: 🔴Critical

### C-05: 品切れ設定
1. customer-admin > メニュー管理 > 任意の商品を品切れON
2. EU注文画面で「sold out」バッジ+注文ボタン無効を確認
3. **テスト後: 品切れOFFに戻す**
- 重要度: 🔴Critical

### C-06: 品切れ解除
1. C-05で品切れにした商品を品切れOFF
2. EU注文画面で再度注文可能になるか確認
- 重要度: 🔴Critical

### C-07: 一括品切れ（全店舗）
1. customer-admin > 一括品切れ機能があるか確認
2. あれば: 全店舗一括品切れ → EU全店舗の注文画面で品切れ表示
3. なければ: SKIP（機能有無を記録）
4. **テスト後: 品切れ解除**
- 重要度: 🟡Warning

### C-08: 品切れタイマー
1. customer-admin > 品切れタイマー設定があるか確認（1h/2h/3h/閉店時）
2. あれば: タイマー設定 → DBの `soldout_until` を確認
3. なければ: SKIP（機能有無を記録）
- 重要度: ℹ️Info

---

## Phase 3: 配達・料金設定テスト 🔴Critical

### C-09: 配達料変更
1. customer-admin > 配達設定 > 配達料を変更
2. EU checkout画面の配達料表示が変更されるか確認
3. **テスト後: 元に戻す**
- 重要度: 🔴Critical

### C-10: 最低注文金額変更
1. customer-admin > 配達設定 > 最低注文金額を変更
2. EU checkout画面で少額注文手数料の発動閾値が変わるか確認
3. **テスト後: 元に戻す**
- 重要度: 🔴Critical

### C-11: 少額注文ポリシー変更
1. customer-admin > 配達設定 > 少額注文ポリシーの設定を確認（surcharge / block）
2. 設定変更可能であれば: surcharge→block に変更
3. EU checkout画面で最低金額未満の注文がブロックされるか確認
4. **テスト後: 元に戻す**
- 重要度: 🟡Warning

### C-12: 配達圏変更
1. customer-admin > 配達設定 > 配達圏(km)の設定を確認
2. 変更可能であれば: 値を変更してEU画面で圏内/圏外判定が変わるか確認
3. **テスト後: 元に戻す**
- 重要度: 🟡Warning

### C-13-fee: 送料無料閾値変更
1. customer-admin > 配達設定 > 送料無料閾値の設定を確認
2. 変更可能であれば: 閾値を変更してEU checkout画面の送料無料バー表示が変わるか確認
3. **テスト後: 元に戻す**
- 重要度: 🟡Warning

---

## Phase 4: 店舗設定テスト 🔴Critical

### C-14: 臨時休業設定
1. customer-admin > 店舗管理 > 臨時休業ON
2. EU注文画面で「注文受付停止中」と表示されるか確認
3. 受注ダッシュボード（SS側）も受付停止表示になるか確認
4. **テスト後: 臨時休業OFFに戻す**
- 重要度: 🔴Critical

### C-15: 臨時休業解除
1. C-14で臨時休業にした店舗を通常営業に戻す
2. EU注文画面が通常表示に復帰するか確認
- 重要度: 🔴Critical

### C-16: 店舗説明文変更
1. customer-admin > 店舗管理 > 説明文を変更
2. EU注文画面の「もっと見る」テキストが更新されるか確認
3. **テスト後: 元に戻す**
- 重要度: ℹ️Info

---

## Phase 5: クーポン・ポイントテスト 🟡Warning

### C-17: クーポン発行
1. customer-admin > クーポン管理 > 新規クーポン作成（テスト用: コード「TEST500」、500円割引）
2. EU checkout画面でクーポンコード入力UIがあるか確認
3. あれば: 「TEST500」入力 → 500円割引が反映されるか確認
4. なければ: SKIP（UIの有無を記録）
- 重要度: 🟡Warning

### C-18: クーポン無効化
1. C-17で作成したクーポンを無効化
2. EU checkout画面で同じコードを入力 → エラーが出るか確認
3. **テスト後: テストクーポンを削除**
- 重要度: 🟡Warning

### C-19: ポイント付与率変更
1. customer-admin > 会員設定 > ポイント付与率の設定を確認
2. 変更UIがあるか確認
3. あれば: 設定内容を記録
4. なければ: SKIP
- 重要度: ℹ️Info

---

## Phase 6: 通知テスト 🟡Warning

### F-01: 注文確認メール（Thanksメール）
1. Thanksメール送信の仕組みを確認（Resend API? Edge Function?）
2. メール送信のトリガーを確認（注文完了時に自動送信?）
3. コード上のメール送信ロジックを確認
4. メールテンプレートの内容を確認（存在する場合）
- **実際のメール受信確認は手動テスト（SKIP）**
- 重要度: 🟡Warning（Go判定のW-03に該当）

### F-02: 注文ステータス変更通知
1. ステータス変更時にEUにメール/プッシュ通知が送られる仕組みがあるか確認
2. コードレベルで確認
3. 未実装の場合: SKIP + TODO記録
- 重要度: 🟡Warning

### F-03: キャンセル通知
1. SS側でキャンセル実行時のEUへの通知確認
2. キャンセル理由がEUに伝わる仕組みがあるか確認
- 重要度: 🟡Warning

---

## Phase 7: データ整合性テスト 🔴Critical

### G-16: 売上レポート金額照合
1. customer-admin > 売上レポート画面を開く
2. 表示されている売上金額を記録
3. DB直接クエリで同期間の注文金額を集計:
```sql
SELECT 
  COUNT(*) as order_count,
  SUM(total_amount) as total_sales,
  SUM(delivery_fee) as total_delivery_fee,
  SUM(service_fee) as total_service_fee
FROM orders
WHERE store_id = '[対象店舗ID]'
AND status NOT IN ('cancelled')
AND created_at >= '[集計開始日]';
```
4. レポート画面の金額とDB集計が一致するか確認
- 重要度: 🔴Critical

### G-15: データエクスポート（CSV）
1. customer-admin > データエクスポート機能があるか確認
2. あれば: CSVダウンロード → 中身確認
   - カラム名が正しいか
   - データ形式（日付、金額等）が適切か
   - PIIマスキングが必要な項目でマスクされているか（顧客名、メール等）
3. なければ: SKIP（機能有無を記録）
- 重要度: 🟡Warning

### G-17: 顧客管理からの注文ステータス変更
1. customer-admin > 注文一覧 > 注文詳細画面を確認
2. ステータス変更UIがあるか確認
3. あれば: ステータス変更 → EUトラッキング画面+SSダッシュボードに反映されるか確認
4. なければ: SKIP（機能有無を記録）
- 重要度: 🟡Warning

---

## Phase 8: 操作ログテスト 🔴Critical

### G-20: audit_logs記録確認
Phase 2〜7の各操作後、audit_logsに正しく記録されているか確認する。

1. Phase 2〜7のテスト実行中に操作ログが記録される操作をリスト化
2. テスト完了後、audit_logsテーブルを確認:
```sql
SELECT 
  id,
  action,
  table_name,
  user_email,
  details,
  created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 30;
```
3. 確認ポイント:
   - 商品変更、価格変更、品切れ設定などの操作が記録されているか
   - user_emailが正しいか
   - detailsに変更内容が含まれているか
4. 記録されていない操作がある場合: どの操作が漏れているか記録
- 重要度: 🔴Critical（Go判定のW-09に該当）

---

## Phase 9: SNS・AI関連（手動SKIP） ℹ️Info

以下は外部API連携が必要なため、手順のみ記録してSKIP:

| ID | 内容 | SKIP理由 |
|---|---|---|
| C-20 | SNS投稿作成+公開 | X/Instagram API連携未設定 |
| C-21 | AI口コミ返信生成 | 外部API連携が必要 |

---

## 完了条件

1. 🔴Critical 全件PASS（FAIL時は修正→再テストまで完了すること）
2. 🟡Warning FAILは原因記録+修正提案（修正可能なら修正）
3. ℹ️Info FAILは記録のみ
4. day4-results.md に全テスト結果をまとめて保存
5. FAILで修正した場合: 変更ファイル一覧と修正内容をday4-results.mdに追記
6. **テストで変更したデータ（価格、品切れ、クーポン等）は全て元に戻す**
7. 顧客管理画面の全体構造（メニュー一覧、各画面のスクショ）をday4-results.mdに記録

---

## テスト実行順序（推奨）

1. Phase 1（基本動作確認）→ ログインできなければ以降のテスト不可
2. Phase 2（メニュー・商品）→ 最も多いテストケース
3. Phase 3（配達・料金）
4. Phase 4（店舗設定）→ 臨時休業テスト
5. Phase 5（クーポン・ポイント）
6. Phase 6（通知）→ コードレベル確認中心
7. Phase 7（データ整合性）→ 売上レポート照合
8. Phase 8（操作ログ）→ Phase 2〜7の操作がログに残っているか最後に一括確認
