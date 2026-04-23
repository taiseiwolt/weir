# CC-Option-Master-Stage2a 本番実行ガイド

> **対象**: Taisei（本番 Supabase Dashboard での手動 SQL 実行 + EF/Vercel デプロイ）
> **関連**: D-242 (Stage 1) / D-166 (metadata 整理) / Taisei 確認 1-3（2026-04-23）
> **所要時間**: 約 20-30 分（SQL 5 分 + EF 5 分 + Vercel 5 分 + リグレッション 5 分 + smoke test 15-25 分）

---

## 0. 前提条件 / 準備

作業開始前に以下を全て満たしていることを確認:

1. **Stage 1 が production に適用済み**
   - migration `supabase/migrations/20260423700000_option_master_stage1.sql` 実行済み
   - 確認方法: Supabase Dashboard → SQL Editor で以下を実行
     ```sql
     SELECT COUNT(*) AS table_count
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('option_groups', 'options', 'product_option_groups', 'option_sale_status');
     -- 期待: 4
     ```
   - 結果が 4 未満なら `docs/cc-option-master-stage1-execution-guide.md` を先に完了させること

2. **本 Stage 2a のコードが `main` に merge 済み**
   - 確認方法: ローカル terminal で `git log main --oneline | grep -E "Stage2a Phase [1-5]"`
   - 期待: Phase 1-5 の 6 commit 以上が main に存在

3. **Supabase CLI インストール済み / プロジェクトリンク済み**
   - 確認方法: `supabase --version` が通ること
   - `supabase link --project-ref iikwusprydaogzeslgdz` がリンク済みであること

4. **Vercel CLI ログイン済み**
   - 確認方法: `vercel whoami` が通ること

5. **ブラウザ / タブ準備**
   - Supabase Dashboard: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz
   - Stripe Dashboard: https://dashboard.stripe.com/
   - 本番サイト: https://xorder.co.jp

---

## 1. 本番 Dashboard SQL 実行（migration 20260423800000）

### 1-1. 事前 SELECT 検証

Supabase Dashboard → SQL Editor で以下を実行し、`selected_options` カラムが**存在しない**ことを確認:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='order_items' AND column_name='selected_options';
-- 実行結果が空なら migration 未適用、1 行返れば適用済み
```

**期待結果**: 0 行（空）。もし 1 行返る場合は既に適用済みなので **1 章全体をスキップし 2 章 EF デプロイへ進む**。

### 1-2. Migration SQL 実行

Migration ファイル `supabase/migrations/20260423800000_order_items_selected_options.sql` を開く。ファイル冒頭の `BEGIN;` から `COMMIT;` までを全文コピーして SQL Editor に貼り付け、「Run」をクリック。

**期待メッセージ**:
```
Success. No rows returned
```

ロールバック用の末尾コメントブロック（`-- BEGIN; ... -- COMMIT;` で囲まれた部分）は貼り付け不要・実行不要。

### 1-3. 事後 SELECT 検証

```sql
-- カラム定義確認
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name='order_items' AND column_name='selected_options';
-- 期待: 1 行、data_type=jsonb, column_default='[]'::jsonb, is_nullable=NO
```

```sql
-- GIN index 確認
SELECT indexname FROM pg_indexes
WHERE tablename='order_items' AND indexname='idx_order_items_selected_options';
-- 期待: 1 行
```

```sql
-- 既存 order_items 行に空配列がデフォで入っていること確認
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE selected_options = '[]'::jsonb) AS empty_array_rows
FROM order_items;
-- 期待: total_rows = empty_array_rows（全既存行が空配列で埋まっている）
```

### 1-4. Rollback SQL（障害時のみ）

Migration ファイル末尾のコメントブロック参照:
```sql
-- BEGIN;
--   DROP INDEX IF EXISTS idx_order_items_selected_options;
--   ALTER TABLE order_items DROP COLUMN IF EXISTS selected_options;
-- COMMIT;
```
`--` を外して Dashboard SQL Editor で実行するとロールバック可能。既存 order_items のデータは列追加のみなので失わない。

---

## 2. Edge Function デプロイ

本 Stage で変更のある EF は 2 本:

- `stripe-create-payment-intent`: order_items に `selected_options` JSONB を INSERT、サーバー側で `price_delta` を再計算して `unit_price` を検証（Phase 3）
- `confirm-order`: D-166 dead code 削除、`didTransitionToPaid` ガードで points/rank/push/email の二重実行を防止（Phase 3）

### 2-1. デプロイ実行

ローカル terminal で以下を順に実行:

```bash
cd /Users/taisei/Desktop/weir
supabase functions deploy stripe-create-payment-intent --project-ref iikwusprydaogzeslgdz
supabase functions deploy confirm-order --project-ref iikwusprydaogzeslgdz
```

**期待メッセージ（各コマンド）**:
```
Deployed Function <function-name> on project iikwusprydaogzeslgdz
```

### 2-2. デプロイ成功確認

1. Supabase Dashboard → **Edge Functions** を開く
2. `stripe-create-payment-intent` / `confirm-order` の行をそれぞれクリック
3. 「Versions」タブでそれぞれ最新のバージョン番号・デプロイ時刻が**今のデプロイと一致**することを確認
4. 「Logs」タブが直近で新規エラー（5xx）を出していないことを確認

---

## 3. Vercel フロント デプロイ

### 3-1. デプロイ実行

```bash
cd /Users/taisei/Desktop/weir
vercel --prod
```

### 3-2. デプロイ成功確認

1. 末尾に `Production: https://xorder.co.jp [some-hash]` が出力されることを確認
2. https://xorder.co.jp/weir-admin.html にアクセスし、ページが開けること
3. https://xorder.co.jp/weir-customer-admin.html にアクセスし、ページが開けること
4. ブラウザキャッシュ対策として **Cmd+Shift+R**（強制リロード）を必ず実行

---

## 4. 既存 Stage 1 admin UI の動作確認（リグレッション）

本 Stage 2a は Stage 1 の UI を壊していないことを確認する。

### 4-1. `/weir-admin.html` オプション管理（既存 Stage 1）

1. https://xorder.co.jp/weir-admin.html → `taisei.maeda@aiden-jp.net` でログイン
2. サイドバーから「🧩 オプション管理」を開く
3. 既存のブランド（Stage 1 smoke test で使った居酒屋潮ブランドなど）の `BRD-xxxxxxx` で検索
4. グループ一覧が表示され、既存グループ行のクリック → 詳細モーダル → 選択肢一覧 の導線が壊れていないこと
5. 「＋ グループ新規作成」で新規グループ保存が成功すること（不要ならすぐ削除）

### 4-2. `/weir-customer-admin.html` メニュー管理の sale_status ラジオ（Phase 4）

1. https://xorder.co.jp/weir-customer-admin.html → ログイン
2. サイドバーから「🍽️ メニュー管理」を開く
3. 居酒屋潮の `BRD-xxxxxxx` で検索 → 既存パターンを選択
4. ヘッダーに **venue セレクタカード**が表示されていること（店舗が複数ある場合）
5. 商品一覧テーブルに **「販売状況」列**が表示され、各商品行にプルダウン（販売中 / 本日売切 / 販売終了）が存在すること
6. 任意の商品プルダウンを「本日売切」に変更 → トースト「商品ステータスを更新しました」 → ページリロードでも状態保持
7. 該当ブランドに `product_option_groups` が紐付いている商品があれば、商品行の下にオプション行（背景色違い）が展開表示されていること

**NG の場合**:
- venue セレクタが出ない → `venues` の brand_id が正しく紐付いているか確認
- 「販売状況」列が出ない → Vercel cache（Cmd+Shift+R）/ または 3-2 のデプロイ成功確認をやり直す

---

## 5. 本番 smoke test トリガー

次ページ `docs/cc-option-master-stage2a-smoke-test.md` の 7 シナリオを実施。

所要目安: 15-25 分（1 シナリオ 2-3 分）。PASS/FAIL を記録した上で最後に完了報告テンプレートを Taisei → CC に返す。

---

## 6. トラブルシューティング

### 6-1. EF デプロイ失敗

**症状**: `supabase functions deploy` が `Error: ...` を返す

**対処**:
1. `supabase status` / `supabase functions list --project-ref iikwusprydaogzeslgdz` で接続確認
2. Supabase Dashboard → **Edge Functions** → 該当 function の「Logs」タブで直近のエラーを確認
3. ネットワーク一時障害の場合: 1-2 分待って再実行
4. それでも失敗する場合: CC に Dashboard スクリーンショット + エラーメッセージで報告

### 6-2. Migration 実行失敗

**症状**: 1-2 の SQL 実行で `ERROR: ...` が返る

**対処**:
1. エラーメッセージ全文をコピーして記録
2. 代表的エラー:
   - `ERROR: relation "order_items" does not exist` → 本番 DB に `order_items` が無い。先行 migration 未適用の可能性が高い。CC に報告
   - `ERROR: column "selected_options" of relation "order_items" already exists` → 既に適用済み。1 章スキップして 2 章へ
3. 1-4 の rollback SQL を実行してから再実行
4. 既存データ整合性を以下で確認:
   ```sql
   SELECT COUNT(*) FROM order_items;
   SELECT COUNT(*) FROM orders;
   -- 両方とも以前把握している件数と一致していれば整合性 OK
   ```

### 6-3. 注文作成で「商品価格が正しくありません」エラー連発

**症状**: smoke test ③ / ② や本番ユーザー注文で checkout → 決済ボタン押下後に「商品価格が正しくありません。ページを更新してやり直してください。」が頻発

**原因の切り分け**:
1. **Stage 1 options master が未投入**: 商品に紐付く option_groups / options / product_option_groups が無い → UI では `price_delta=0` だがサーバーは option_id を見つけられない
   - 確認 SQL:
     ```sql
     SELECT COUNT(*) FROM product_option_groups;
     SELECT COUNT(*) FROM options;
     ```
     両方 0 なら Stage 1 master 未投入。Stage 1 bulk-import で投入する
2. **価格検証（`price_delta`）が厳しすぎる**: 客側で送信された `unit_price` が `basePrice + Σ(server price_delta)` と 1 円でも違うと reject
   - 確認方法: Supabase Dashboard → Edge Functions → `stripe-create-payment-intent` → Logs で `client_unit_price` / `expected_unit_price` を grep
3. **緊急時の一時対応**: EF の `stripe-create-payment-intent/index.ts` で `selected_options` を含む item ブロック付近（検索ワード: `"selected_options" in item` もしくは `Phase 2 新シェイプ`）の検証ロジックを一時コメントアウトして再デプロイ。**ただし根本原因が解決したら必ず戻すこと**

### 6-4. confirm-order が `ORDER_NOT_FOUND_AFTER_PAYMENT` を返す

**症状**: Stripe 決済成功後、注文完了画面に「注文の確定に失敗しました」エラー、ログに `ORDER_NOT_FOUND_AFTER_PAYMENT`

**原因**: stripe-create-payment-intent の orders INSERT が失敗している可能性大（Phase 3 で D-166 dead code を削除したため、INSERT 失敗時の fallback が無い）

**対処**:
1. Supabase Dashboard → Edge Functions → `stripe-create-payment-intent` → Logs で同時刻の 5xx エラー / INSERT 失敗ログを確認
2. よくある原因:
   - `venue_id` が無効 / RLS policy で INSERT 拒否
   - `order_items.product_id` が `products` テーブルに存在しない（seed ズレ）
   - `selected_options` JSONB が snapshot 形状違反（`option_id` が UUID でない等）
3. Stripe Dashboard → 該当 PaymentIntent を refund（90 日以内）
4. CC にログ共有で報告

### 6-5. Scene B の「本日売切」にしたオプションが本番ブランドページで非表示にならない

**想定内動作**（Stage 2a スコープ外）。詳細は smoke test シナリオ 5 の注記参照。本 Stage 2a では:
- `option_sale_status` への書き込み UI は完成済み（Phase 4）
- `option_sale_status='sold_out_today'` を読んでブランドページで非表示化する読み込みロジックは **Stage 2b で Flutter POS と同時統合予定**

現状 Stage 2a 完了時点では DB には正しく書き込まれ、データは準備済み。ブランドページへの反映は Stage 2b 待ち。

---

## 7. 手動作業 CHECKLIST

Taisei が実行するタスク一覧。全て完了したら完了報告を CC へ。

- [ ] **1-1 / 1-3**: 本番 Dashboard で migration 20260423800000 事前 SELECT → migration 実行 → 事後 SELECT
- [ ] **2-1**: `supabase functions deploy stripe-create-payment-intent --project-ref iikwusprydaogzeslgdz`
- [ ] **2-1**: `supabase functions deploy confirm-order --project-ref iikwusprydaogzeslgdz`
- [ ] **2-2**: Supabase Dashboard → Edge Functions で 2 本のバージョン更新確認
- [ ] **3-1**: `vercel --prod`
- [ ] **3-2**: 本番サイト 2 ページで強制リロード確認（Cmd+Shift+R）
- [ ] **4-1**: `/weir-admin.html` オプション管理リグレッション 5 項目
- [ ] **4-2**: `/weir-customer-admin.html` メニュー管理リグレッション 7 項目
- [ ] **5**: smoke test 7 項目（`docs/cc-option-master-stage2a-smoke-test.md`）

---

## 8. 完了報告テンプレート

以下を Taisei → CC に連絡:

```
Stage 2a 本番反映完了:
- [1] migration 20260423800000 実行: PASS/FAIL
- [2] EF デプロイ (stripe-create-payment-intent / confirm-order): PASS/FAIL
- [3] Vercel デプロイ: PASS/FAIL
- [4-1] /weir-admin.html オプション管理リグレッション: PASS/FAIL
- [4-2] /weir-customer-admin.html メニュー管理リグレッション: PASS/FAIL
- [5] smoke test 7 項目: 詳細は smoke test 完了報告を参照

Issue（もしあれば）:
- 項目:
- 症状:
- スクリーンショット / ログ:
```
