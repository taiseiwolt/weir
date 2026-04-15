# Weir Day 5 テスト依頼書

実行日: 2026-03-22
前提: Day 1〜4 完了済み
対象: 管理マスタ（H）+ ブランドHP（I）+ クロスブラウザ（J）+ セキュリティ最終確認（L）+ 管理マスタ→他画面反映（③）+ AOギャップ（G-18〜21）

---

## 接続情報

- GitHub: https://github.com/taiseiwolt/aiden-demo
- ローカルリポジトリ: ~/Desktop/aiden-demo
- 作業ディレクトリ（HTML）: ~/Desktop/aiden.html/
- 本番URL: https://weir.co.jp
- Supabase URL: https://iikwusprydaogzeslgdz.supabase.co
- Supabase Anon Key: sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC
- Access Token: sbp_0bc989fd83759e2909944e4a7117b341834c19b8（期限: 2026-04-15）
- Stripe Publishable Key: pk_test_51TAiXe8IrssGKLKQ...
- Stripe Secret Key: Supabase SecretsにSTRIPE_SECRET_KEYとして設定済み

---

## テスト結果の記録ルール

- 全結果を `~/Desktop/aiden-demo/test-results/day5-results.md` に記録
- 各テストに **PASS / FAIL / SKIP（理由）** を記載
- FAILの場合: 原因特定→修正→再テストまで実施。修正内容もday5-results.mdに記録
- 重要度: 🔴Critical / 🟡Warning / ℹ️Info

---

## Phase 1: 管理マスタ 基本動作テスト 🔴Critical

管理マスタ（admin）がWeir運営（AO）として正しく動作するか確認。

### AD-01: 管理マスタ ログイン+画面一覧確認
1. 管理マスタ画面のURLを特定して開く
2. ログイン画面表示 → ログイン
3. 全メニュー/画面を確認し、存在する画面一覧をday5-results.mdに記録
4. 各画面にエラーなく遷移できるか
- 期待: 全画面エラーなし表示
- 重要度: 🔴Critical

### G-18: 法人/ブランド/店舗の新規追加
1. 管理マスタから法人を新規追加（テスト法人名: 「テスト法人999」）
2. ブランドを新規追加（テストブランド名: 「テストブランド999」）
3. 店舗を新規追加（テスト店舗名: 「テスト店舗999」）
4. 追加後、以下で表示されるか確認:
   - EU注文画面（weir-order-store.html）に新店舗表示
   - customer-admin画面で新ブランド/店舗表示
5. **テスト後: テストデータを削除または無効化**
- 期待: 新規追加データが全画面に反映
- 重要度: 🔴Critical

### G-19: CSV一括アップロード
1. 管理マスタにCSV一括アップロード機能があるか確認
2. ある場合: テストCSVでアップロード → データ正確性確認
3. ない場合: SKIP
- 重要度: 🟡Warning

---

## Phase 2: 管理マスタ → 他画面反映テスト 🔴Critical

管理マスタでの変更が他画面に正しく反映されるか確認。
**全テストで変更後は必ず元の値に戻すこと。**

### 店舗情報変更

#### M-01: 店舗名変更
1. admin > 店舗詳細 > 店舗名を変更（末尾に「テスト」追加）
2. 確認先:
   - EU注文画面（weir-order-store.html）で店舗名変更反映
   - 受注ダッシュボード（weir-order-dashboard.html）で店舗名変更反映
   - customer-admin画面で店舗名変更反映
3. **テスト後: 元の店舗名に戻す**
- 重要度: 🔴Critical

#### M-02: 営業時間変更
1. admin > 店舗詳細 > 営業時間を変更（例: 閉店時間を1時間前倒し）
2. EU注文画面で営業時間表示が変わるか確認
3. 営業時間外に設定した場合、注文ブロックされるか確認
4. **テスト後: 元の営業時間に戻す**
- 重要度: 🔴Critical

#### M-03: 住所変更
1. admin > 店舗詳細 > 住所を変更
2. EU店舗選択画面で住所表示が変わるか確認
3. 地図ピン位置が変わるか確認（緯度経度の更新）
4. **テスト後: 元の住所に戻す**
- 重要度: 🟡Warning

#### M-04: 電話番号変更
1. admin > 店舗詳細 > 電話番号を変更
2. EU店舗情報表示で電話番号が変わるか確認
3. **テスト後: 元の電話番号に戻す**
- 重要度: 🟡Warning

### サービス設定変更

#### M-05: MOテイクアウトOFF
1. admin > サービス設定 > MO（テイクアウト）OFF
2. EU注文画面でテイクアウトタブが非表示になるか確認
3. **テスト後: ONに戻す**
- 重要度: 🔴Critical

#### M-06: MOデリバリーOFF
1. admin > サービス設定 > MO（デリバリー）OFF
2. EU注文画面でデリバリータブが非表示になるか確認
3. **テスト後: ONに戻す**
- 重要度: 🔴Critical

#### M-07: AI/CRMプラン変更
1. admin > サービス設定でプラン変更（STD→PRO等）の機能確認
2. ある場合: 変更 → customer-admin画面でPRO機能有効化確認
3. ない場合: SKIP
4. **テスト後: 元に戻す**
- 重要度: 🟡Warning

#### M-08: サービス全OFF
1. admin > サービス設定 > 全サービスOFF
2. EU画面で「サービス利用不可」等の表示確認
3. **テスト後: 全サービスONに戻す**（⚠️ 戻し忘れ注意）
- 重要度: 🔴Critical

### アカウント管理

#### M-09: スタッフアカウント追加
1. admin > アカウント管理でスタッフアカウント追加機能の確認
2. ある場合: テストアカウント追加 → customer-adminにログイン可能か確認
3. **テスト後: テストアカウント削除**
- 重要度: 🟡Warning

#### M-10: スタッフアカウント削除
1. M-09で追加したアカウント（またはテスト用アカウント）を削除
2. 削除後にcustomer-adminにログイン不可になるか確認
- 重要度: 🟡Warning

#### M-11: 権限変更
1. アカウントの権限変更機能があるか確認（閲覧のみ↔編集可）
2. ある場合: 変更 → customer-admin画面で編集ボタンの有効/無効確認
3. ない場合: SKIP
- 重要度: 🟡Warning

### 請求・手数料関連

#### M-12: 請求書調整項目追加
1. admin > 請求管理で調整項目（控除等）追加機能の確認
2. ある場合: テスト調整追加 → 請求書PDF/customer-admin請求画面での反映確認
3. ない場合: SKIP
- 重要度: 🟡Warning

#### M-13: 補償ポイント付与
1. admin > 補償管理でポイント付与機能の確認
2. ある場合: テストユーザーにポイント付与 → EU MyPageでポイント残高確認
3. ない場合: SKIP
- 重要度: 🟡Warning

#### M-14: BAN登録
1. admin > BAN管理でメールアドレス追加機能の確認
2. ある場合: テストメールでBAN登録 → checkout時にブロック確認
3. **テスト後: テストBANデータを削除**
- 重要度: 🟡Warning

---

## Phase 3: 請求書PDF生成テスト 🟡Warning

### G-21: 請求書PDF生成
1. 管理マスタに請求書PDF生成機能があるか確認
2. ある場合:
   - PDF生成を実行
   - 金額が正しいか（ordersテーブルの集計と照合）
   - 明細項目が正しいか
   - 調整項目がある場合、正しく反映されているか
3. ない場合: SKIP
- 重要度: 🟡Warning

---

## Phase 4: ブランドHP テスト 🟡Warning

### HP-01: ブランドHP表示確認
1. aiden-brand-sushiro.html（ブランドHP）を開く
2. ページが正常に表示されるか確認
3. ヒーロー画像、おすすめ商品セクション等のコンテンツ確認
4. 「注文する」等のCTAボタン → EU注文画面への遷移確認
- 重要度: 🟡Warning

### HP-02: ブランドHP レスポンシブ確認
1. スマホ（375px）、タブレット（768px）、PC（1280px）で表示確認
2. レイアウト崩れがないか
- 重要度: ℹ️Info

---

## Phase 5: クロスブラウザテスト 🟡Warning

CCではChrome操作が中心のため、コード上の互換性リスク分析で代替。

### J-01: CSS互換性チェック
1. 全HTMLファイルで使用しているCSSプロパティを確認
2. 互換性が低いプロパティ（`gap` on flex, `aspect-ratio`, `:has()` 等）がないか
3. ベンダープレフィックスが必要なプロパティがないか
- 重要度: 🟡Warning

### J-02: JavaScript互換性チェック
1. 全HTMLファイルで使用しているJS APIを確認
2. 互換性が低いAPI（`structuredClone`, `Array.at()` 等）がないか
3. Safari古いバージョンでの互換性リスクを確認
- 重要度: 🟡Warning

### J-03: iPad表示確認（G-11）
1. 受注ダッシュボード（weir-order-dashboard.html）をiPadサイズ（768×1024）で表示
2. レイアウト崩れ、ボタン操作性を確認
3. Chrome DevToolsのデバイスシミュレーションで確認
- 重要度: 🟡Warning

---

## Phase 6: セキュリティ最終確認 🔴Critical

### L-01: 全HTMLファイルのセキュリティスキャン
1. 全HTMLファイルで以下を検索・確認:
   - `innerHTML` の使用箇所 → escapeHtml適用済みか
   - `eval()` の使用がないか
   - ハードコードされたSecret Key（Stripe Secret Key等）がないか（Supabase Anon Keyは許容）
   - `http://`（非HTTPS）のリンクがないか
2. 問題箇所を一覧化
- 重要度: 🔴Critical

### L-02: Edge Function セキュリティ確認
1. 全Edge Functionファイルを確認:
   - JWT検証がある関数: confirm-order（SEC-03で追加済み）
   - 他のEdge Functionにも認証が必要か確認
   - Secret Keyがコード内にハードコードされていないか（Supabase Secretsから取得しているか）
2. 問題箇所を一覧化
- 重要度: 🔴Critical

### L-03: RLSポリシー総点検
```sql
SELECT 
  schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```
1. 全テーブルのRLSポリシーを取得して記録
2. 確認ポイント:
   - 重要テーブル（orders, members, guests, payment_attempts）にSELECT制限があるか
   - anon keyでアクセスすべきでないテーブルにanonロールの許可がないか
   - SEC-01修正（orders USING(false)）が適用されているか
- 重要度: 🔴Critical

### L-04: Supabase公開スキーマ確認
```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```
1. 公開スキーマに不要なテーブルが露出していないか確認
2. orders_public_view が存在し、PII除外されているか確認
- 重要度: 🔴Critical

---

## Phase 7: audit_logs最終確認 🟡Warning

### G-20-2: 管理マスタ操作ログ確認
Phase 2の各操作後に、audit_logsに正しくログが記録されているか確認。

```sql
SELECT 
  id, action, table_name, record_id, user_email, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 30;
```

確認ポイント:
1. 管理マスタからの操作が記録されているか
2. Day 4で修正したRLSポリシーが管理マスタ側でも機能しているか
- 重要度: 🟡Warning

---

## 手動テスト（SKIP - テスト手順のみ記録）

| ID | 内容 | 理由 |
|---|---|---|
| H-08 | iPad実機テスト | J-03のDevToolsシミュレーションで代替 |
| H-09 | スマホ実機テスト | DevToolsシミュレーションで代替 |

---

## 完了条件

1. 🔴Critical 全件PASS（FAIL時は修正→再テストまで完了）
2. 🟡Warning FAILは原因記録+修正提案（修正可能なら修正）
3. ℹ️Info FAILは記録のみ
4. day5-results.md に全テスト結果をまとめて保存
5. FAILで修正した場合: 変更ファイル一覧と修正内容をday5-results.mdに追記
6. **Phase 2の全テスト後は必ず変更を元に戻すこと**
7. Phase 6（セキュリティ）で問題が見つかった場合は即修正

---

## テスト実行順序（推奨）

1. Phase 1（管理マスタ基本動作）→ Phase 2がブロックされないように最初に
2. Phase 2（管理マスタ→他画面反映）→ Day 5最大のテスト範囲
3. Phase 6（セキュリティ最終確認）→ Go/No-Go判定のCritical
4. Phase 7（audit_logs確認）→ Phase 2の操作ログ確認
5. Phase 3（請求書PDF）
6. Phase 4（ブランドHP）
7. Phase 5（クロスブラウザ）
