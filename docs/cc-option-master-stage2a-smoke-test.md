# CC-Option-Master-Stage2a 本番 Smoke Test

> **対象**: Taisei（本番環境での UI 実機確認 + Stripe 決済テスト）
> **前提**: `docs/cc-option-master-stage2a-execution-guide.md` の 1-4 章（SQL / EF / Vercel / リグレッション）が完了していること
> **所要時間**: 約 15-25 分（7 項目、1 項目 2-3 分）

---

## 事前準備

1. **Vercel deploy 完了確認**: https://xorder.co.jp/weir-admin.html が最新コードで配信されているか確認（execution-guide 3-2 完了済）
2. **Weir 管理マスタにログイン**: `taisei.maeda@aiden-jp.net` でログイン
3. **テスト対象ブランド準備**: 居酒屋潮ブランドの `BRD-xxxxxxx` を手元に用意
4. **Stage 1 テストデータ利用**: Stage 1 smoke test で投入済みの「鶏つくね」+「味付け」グループ（タレ / 塩 / おろしポン酢）を使う。未投入なら Stage 1 smoke test ②③④ を先に実施
5. **Stripe テストカード**: `4242 4242 4242 4242` / 有効期限 任意未来日 / CVC 任意 3 桁
6. **別タブで Supabase Dashboard と Stripe Dashboard を開いておく**:
   - Supabase: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz
   - Stripe: https://dashboard.stripe.com/

---

## Smoke Test 7 項目

### ① オプション表示（ブランドページ）

**手順**:
1. https://xorder.co.jp/izakaya-ushio（居酒屋 潮）にアクセス
2. メニューが表示されたら、**Stage 1 で「味付け」グループを紐付けた商品カード**（例: 鶏つくね）をクリック
3. 商品詳細モーダルが開く
4. モーダル内の商品説明・価格の下に「**選択可能なオプション**」セクションが表示されることを確認
5. セクション内に:
   - グループ名（例: 「味付け」）
   - 「必須」もしくは「任意」のラベル
   - 各選択肢（タレ / 塩 / おろしポン酢）
   - 価格差分が非ゼロの選択肢には `+¥50` のような加算額表示

**期待結果**: モーダル側でオプションセクションが**正しく**表示される（XSS なし、D-83 違反なし = 商品名ハードコードなし）

**FAIL 時**:
- **オプションセクションが表示されない（option 未紐付け商品）**: D-83 遵守の挙動として想定通り。空グループ配列 = セクション非表示が正しい動作 → **PASS 扱い**
- **オプションセクションが表示されない（option 紐付け済み商品）**: Supabase Dashboard → SQL Editor で以下を確認:
  ```sql
  SELECT p.name, g.name AS group_name, o.name AS option_name, o.price_delta
  FROM products p
  JOIN product_option_groups pog ON pog.product_id = p.id
  JOIN option_groups g ON g.group_id = pog.group_id
  JOIN options o ON o.group_id = g.group_id
  WHERE p.name = '鶏つくね';
  ```
  DB に行があるのに UI で出ない場合はブラウザコンソール（F12）でエラーを確認し CC に報告

---

### ② オプション付き注文（ラジオ必須グループ）

**手順**:
1. https://xorder.co.jp/izakaya-ushio から注文ページ（店内）へ遷移し、「鶏つくね」の商品詳細モーダルを開く
2. 「味付け」グループ（必須・ラジオ）で「**タレ**」を選択
3. 「カートに追加」ボタンをクリック
4. カート画面で:
   - 商品行に「鶏つくね」+「（タレ）」の表示
   - 金額に `¥XXX` の表示（tare = `price_delta=0` なので基本価格のまま）
5. checkout 画面へ進める（ボタン活性）

**期待結果**: カート行にオプション名が併記表示、checkout 画面に遷移できる

**DB 検証（Taisei 本番 SQL）**:
**重要**: 本項は Stripe 決済まで進む前の**カート状態**のため、まだ order_items には書き込まれない。
checkout → 決済まで進んだあとで以下を実行:

```sql
SELECT id, product_id, unit_price, selected_options
FROM order_items
ORDER BY id DESC LIMIT 1;
```

**期待結果**:
- `selected_options` に JSON 配列 `[{option_id, option_name:'タレ', group_id, group_name:'味付け', price_delta:0}]` が入っている
- `unit_price` = 鶏つくねの base price（tare は price_delta 0 なので変動なし）

**FAIL 時**:
- カート行に「（タレ）」が出ない → `weir-order-store.html` のカート描画ロジック確認
- `selected_options` が `[]` で空 → EF `stripe-create-payment-intent` が新シェイプを受け取れていない可能性。EF ログを CC に共有

---

### ③ 価格変動オプション（price_delta 加算）

**事前準備**（Taisei が本番 Dashboard UI で実行）:
1. `/weir-admin.html` → オプション管理 → 居酒屋潮ブランドで「**トッピング**」グループを新規作成（複数選択 / 任意 でも OK）
2. 上記グループに「**大盛**」選択肢を `price_delta=200` で追加
3. `/weir-admin.html` → メニュー管理 → 「**枝豆**」商品（存在しない場合は他の任意商品）にトッピンググループを紐付け

**手順**:
1. https://xorder.co.jp/izakaya-ushio から注文ページへ遷移
2. 「枝豆」商品詳細モーダルを開き、「大盛 +¥200」を選択 → カート追加
3. checkout 画面に進む
4. サイドバーの金額内訳を確認:
   ```
   商品小計    ¥380（枝豆 base price = 例として 380 円と仮定）
   オプション加算 ¥200
   ─────────────
   合計        ¥580
   ```
5. Stripe テストカード `4242 4242 4242 4242` / 有効期限未来日 / CVC 任意 で「注文確定」
6. 決済完了 → 注文完了画面に遷移できること

**DB 検証**:
```sql
SELECT id, product_id, unit_price, selected_options
FROM order_items
WHERE selected_options @> '[{"option_name":"大盛"}]'::jsonb
ORDER BY id DESC LIMIT 1;
```

**期待結果**:
- `selected_options` に `{option_name:'大盛', price_delta:200, group_name:'トッピング', ...}` が含まれる
- `unit_price` = 枝豆 base price + 200（例: base 380 円なら `unit_price=580`）

**FAIL 時**:
- 「商品価格が正しくありません」エラー → execution-guide 6-3 トラブルシューティング参照
- checkout 画面にオプション加算行が出ない → `weir-order-checkout.html` の `buildCheckoutOptionText` ロジック確認

---

### ④ 必須オプション未選択エラー

**手順**:
1. https://xorder.co.jp/izakaya-ushio から注文ページへ
2. 「味付け」が**必須**の商品（鶏つくね = ②③ 同じ商品）の詳細モーダルを開く
3. **何も選択せず**に「カートに追加」ボタンをクリック

**期待結果**:
- ボタンが disabled 状態（クリック不可）になる、もしくは
- エラーメッセージ「**味付け の選択は必須です**」が画面に表示される
- グループ名（「味付け」）は DB から取得した値が使われる — ハードコード禁止

**PASS 条件**: カート追加がブロックされ、かつメッセージ内のグループ名が DB 値と一致する

**FAIL 時**:
- ボタンが押せてカートに入ってしまう → `weir-order-store.html` の `is_required` バリデーションロジック確認
- メッセージに「味付け」以外のハードコード文字列が出る → D-83 違反。CC に報告

---

### ⑤ 品切れタブ動作（Scene B）

**手順**:
1. https://xorder.co.jp/weir-customer-admin.html へアクセス → ログイン
2. サイドバー「🍽️ メニュー管理」を開く
3. 居酒屋潮の `BRD-xxxxxxx` で検索 → 既存パターンを選択
4. ヘッダーの **venue セレクタカード**で特定店舗を選択
5. 商品一覧テーブルで、オプショングループが紐付いている商品（例: 鶏つくね）の行の**下**にオプション行（背景色が薄い背景）が展開表示されていることを確認
6. **「煮玉子」もしくは任意のオプション行**を見つけ（煮玉子が無い場合は任意のオプション）、その行の「販売状況」プルダウンをクリック
7. 「**本日売切**」を選択

**期待結果**:
- トースト「**オプションステータスを更新しました**」が表示される
- 画面をリロード（Cmd+Shift+R）しても、そのオプション行の販売状況が「本日売切」のまま保持される

**DB 検証**:
```sql
SELECT venue_id, option_id, status, updated_by, updated_at
FROM option_sale_status
ORDER BY updated_at DESC LIMIT 1;
```

**期待結果**:
- `status='sold_out_today'`
- `updated_by='merchant'`
- `venue_id` が手順 4 で選択した venue の UUID と一致

**ブランドページ側確認**（Stage 2b 待ち項目）:
https://xorder.co.jp/izakaya-ushio から該当商品詳細モーダルを開き、「煮玉子」選択肢がグレーアウトもしくは非表示になるか確認

**注記**:
- **本 Stage 2a スコープ外**: ブランドページ側で `option_sale_status.status='sold_out_today'` を読んで非表示化する読み込みロジックは **Stage 2b で Flutter POS と同時統合予定**（または P2+follow-up）
- 現状 Phase 2 の選択肢描画ロジックは `options.is_available !== false` のみ判定しており、`option_sale_status` テーブルとは**別系統**
- したがって DB 書き込みが成功 = 本シナリオ PASS。ブランドページ反映は Stage 2b フラグ項目

**Scene A について**:
- Scene A = 日次売切（毎日店開け時に自動リセット）の Flutter POS 側 UI は **Stage 2b Flutter スコープ**
- 本 CC では DB テーブル（`option_sale_status`）と customer-admin UI 設定は完成、Flutter 側の表示・書き込みは Stage 2b

---

### ⑥ D-166 metadata 整合性

**手順**: ③ のテスト注文が完了したあと、以下を確認

#### 6-A. Stripe Dashboard 側の metadata

1. Stripe Dashboard（test mode）→ **Payments** → 先ほどの注文の PaymentIntent を開く
2. 「Metadata」セクションを展開
3. **含まれていること**を確認:
   - `order_id` = DB の `orders.display_id`（例: `ORD-xxxxxxx`）
   - `venue_name` = 店舗名
   - `venue_id` = venue の UUID
   - `order_type` = `dine_in` / `takeout` / `delivery` のいずれか
   - `delivery_fee` = 数値文字列
   - `service_fee` = 数値文字列
   - `surcharge_amount` = 数値文字列
   - `idempotency_key` = UUID 形式

4. **含まれていないこと**を確認（D-166 リファクタリングで除去済）:
   - `cart_items_json` / `cart_items` / `items_json`
   - `guest_email` / `customer_email`
   - `customer_name`
   - `delivery_address_json` / `delivery_address`

**PASS 条件**: 8 項目が含まれ、4 項目（PII + bulk cart）が含まれない

#### 6-B. DB 整合性

```sql
-- 直近の注文と Stripe metadata の order_id が一致するか
SELECT o.display_id AS order_id_in_db,
       o.venue_id,
       v.name AS venue_name,
       COUNT(oi.id) AS item_count
FROM orders o
JOIN venues v ON v.id = o.venue_id
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.id = (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1)
GROUP BY o.display_id, o.venue_id, v.name;
```

**期待結果**: 1 行、`order_id_in_db` が Stripe metadata の `order_id` と一致、`item_count >= 1`

```sql
-- order_items の selected_options スナップショットも同じ注文に紐付いているか
SELECT oi.id, oi.unit_price, oi.selected_options
FROM order_items oi
WHERE oi.order_id = (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1);
```

**期待結果**: 1 行以上、少なくとも 1 つの `selected_options` 配列に option snapshot が入っている（③ 大盛オプション等）

**FAIL 時**:
- Stripe metadata に `cart_items_json` が残っている → 3-1 Vercel デプロイが古い可能性。再デプロイ + ブラウザキャッシュクリア
- `order_id_in_db` と Stripe metadata が食い違う → EF で orders INSERT 失敗 / 別 orders 行が参照されている。CC 報告

---

### ⑦ 翌日自動リセット（Stage 2b フラグ）

**本 CC では対象外**。

`sold_out_today` の自動リセット（pg_cron）は**既存 products 用 job を踏襲予定**だが、`option_sale_status` 向けの pg_cron job 追加は **Stage 2b 管轄**。

現 Stage 2a 完了時点では:
- Scene B UI（メニュー管理ページで「本日売切」→「販売中」に戻す操作）で Taisei が**手動リセット**
- もしくは DB 直接 UPDATE

**参考 SQL**（翌日以降に Taisei が必要に応じて実行）:
```sql
-- option_sale_status の本日売切を全て販売中に戻す
UPDATE option_sale_status
SET status='available', updated_at=NOW()
WHERE status='sold_out_today';

-- products の本日売切も戻す（既存ロジック）
UPDATE products
SET sale_status='on_sale', updated_at=NOW()
WHERE sale_status='sold_out_today';
```

**本項目の PASS 条件**: 参考 SQL を 1 回試し、UPDATE 件数が想定どおり（先ほど「本日売切」に変えた option 分）返ることを確認 → SKIP でも可

---

## 共通合格基準

全 7 シナリオ実施後、以下も確認:

- [ ] ローカル開発環境で `npm run lint` が PASS（pre-deploy 時点で済ませておく）
- [ ] Stripe Dashboard ログに新規 warning が出ていない（Events → Recent events）
- [ ] Supabase Dashboard → Edge Functions ログに 5xx が新規発生していない（`stripe-create-payment-intent` / `confirm-order` 両方確認）
- [ ] XSS チェック: `/weir-admin.html` オプション管理で、新規選択肢を作成する時に選択肢名へ `<script>alert(1)</script>` を登録し保存 → ブランドページの商品詳細モーダルで**スクリプトが実行されない / エスケープされて表示される**こと（検証後は削除）

---

## FAIL 時のロールバック手順

いずれかの段階で致命的 FAIL が発生した場合、以下の順序で元に戻す:

### 1. Vercel フロント戻す
```bash
cd /Users/taisei/Desktop/weir
vercel list
# 直前の production deployment URL を確認
vercel rollback <previous-deployment-url>
```

### 2. Edge Function を前バージョンへ戻す
Supabase Dashboard → Edge Functions → `stripe-create-payment-intent` → 「Versions」タブ → 前バージョンの「Redeploy」ボタン
同様に `confirm-order` も戻す

もしくは CLI で:
```bash
supabase functions deploy stripe-create-payment-intent --project-ref iikwusprydaogzeslgdz --version <previous-version>
```

### 3. Migration rollback（**データ損失注意**）
Supabase Dashboard → SQL Editor で以下を実行:
```sql
BEGIN;
  DROP INDEX IF EXISTS idx_order_items_selected_options;
  ALTER TABLE order_items DROP COLUMN IF EXISTS selected_options;
COMMIT;
```
**注意**: このロールバックで `selected_options` カラムは削除される。ロールバック時点までに書き込まれた選択オプション履歴は失われる。必要なら rollback 前に以下でバックアップ:
```sql
CREATE TABLE order_items_selected_options_backup AS
SELECT id, selected_options FROM order_items WHERE selected_options != '[]'::jsonb;
```

### 4. 原因調査を CC に依頼
スクリーンショット + ログ（Stripe Dashboard / Supabase Dashboard Edge Functions / ブラウザ F12 コンソール）を添付

---

## 完了報告テンプレート

以下を Taisei → CC に連絡:

```
Stage 2a Smoke Test 結果:
- ① オプション表示（ブランドページ）: PASS/FAIL
- ② オプション付き注文（ラジオ必須）: PASS/FAIL
- ③ 価格変動オプション（price_delta 加算）: PASS/FAIL
- ④ 必須オプション未選択エラー: PASS/FAIL
- ⑤ 品切れタブ動作（Scene B）: PASS/FAIL
    ブランドページ反映: Stage 2b 待ち（対象外）
- ⑥ D-166 metadata 整合性: PASS/FAIL
- ⑦ 翌日自動リセット: Stage 2b 待ち / 手動 SQL 確認のみ PASS/SKIP

共通合格基準:
- npm run lint: PASS/FAIL
- Stripe Dashboard warning: 新規なし / あり
- Supabase EF Logs 5xx: 新規なし / あり
- XSS <script> エスケープ確認: PASS/FAIL

Issue（もしあれば）:
- 項目:
- 症状:
- ブラウザコンソール内容（F12）:
- スクリーンショット:
```

---

## 既知の制限事項（Stage 2a）

- **Scene B のブランドページ反映は Stage 2b**: customer-admin UI で `sold_out_today` 設定は保存されるが、ブランドページ側で選択肢を非表示化する読み込みロジックは Stage 2b（Flutter POS 統合時）実装
- **pg_cron による翌日リセットは Stage 2b**: `option_sale_status` の自動リセット cron は Stage 2b で products と同様に実装予定
- **Flutter POS の option 対応は Stage 2b**: 受注アプリ（Flutter）でのオプション表示・売切設定 UI は Stage 2b 管轄
- **Stage 1 options master を先に投入する必要あり**: 本 Stage 2a は Stage 1（`option_groups` / `options` / `product_option_groups`）のデータが投入済みであることが前提。未投入のブランドでは ①②③④⑤ の smoke test ができない
