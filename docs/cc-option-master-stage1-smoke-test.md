# CC-Option-Master-Stage1 本番 Smoke Test

> **対象**: Taisei（本番環境での UI 実機確認）
> **前提**: `docs/cc-option-master-stage1-execution-guide.md` の migration 実行が完了していること
> **所要時間**: 約 15-25 分（7 項目、1 項目 2-3 分）

---

## 事前準備

1. Vercel deploy 完了確認: https://weir.vercel.app/weir-admin.html が最新コードで配信されているか確認
2. Weir 管理マスタにログイン: `taisei.maeda@aiden-jp.net` でログイン
3. テスト対象ブランド準備: 居酒屋潮ブランドの display_id（`BRD-xxxxxxx`）を手元に用意
4. Supabase Dashboard も別タブで開いておく（DB 確認用）: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz

---

## Smoke Test 7 項目

### ① オプション管理タブでブランドを選択

**手順**:
1. サイドバーに新しく「🧩 オプション管理」項目が表示されていることを確認
2. クリックしてオプション管理ページを開く
3. ページタイトル「オプション管理」と説明文「商品オプション（味付け / トッピング / サイズ等）をブランド単位で管理」が表示されることを確認
4. 検索 input に居酒屋潮ブランドの `BRD-xxxxxxx` を入力 → 「🔍 検索」ボタン
5. ブランド情報カードが表示され、グループ数・選択肢総数・商品連携・商品総数が全て 0 になっていることを確認
6. 「📋 オプショングループ一覧」カードに「まだオプショングループがありません」と空状態メッセージが表示されることを確認

**期待結果**: ページ遷移成功 + ブランド情報 + 空状態メッセージ

**FAIL 時**: 
- nav item が表示されない → キャッシュクリア（Cmd+Shift+R）
- ページが真っ白 → ブラウザコンソールでエラー確認、CC に報告

---

### ② グループ作成: 「味付け」 (single, required=true)

**手順**:
1. 「＋ グループ新規作成」ボタンをクリック
2. モーダルに以下を入力:
   - グループ名: `味付け`
   - 選択タイプ: `単一選択（ラジオ）`
   - 並び順: `1`
   - 「必須選択」チェックボックス ON
   - 「利用可」チェックボックス ON
3. 「保存」ボタンクリック
4. トースト「✅ グループを追加しました」を確認
5. グループ一覧に「味付け」行が表示され、選択タイプ「単一（ラジオ）」、必須「必須」、利用可「✓」、選択肢数「0」、商品連携「0」になっていることを確認

**DB 確認（Supabase Dashboard → Table Editor → option_groups）**:
```sql
SELECT group_id, display_id, name, selection_type, is_required, is_available, sort_order
FROM option_groups
WHERE name = '味付け';
```
**期待結果**: 1 行、`GRP-xxxxxxx` 形式の display_id、is_required=true、is_available=true

---

### ③ 選択肢作成: 「味付け」グループに 3 選択肢

**手順**:
1. 「味付け」行をクリック → 詳細モーダルが開く
2. モーダル内に「選択肢がまだありません」の空状態メッセージを確認
3. 「＋ 選択肢追加」ボタンをクリック
4. フォームに以下を入力:
   - 選択肢名: `タレ`
   - 価格差分: `0`
   - 並び順: `1`
   - 「デフォルト選択」ON
   - 「利用可」ON
5. 「保存」→ トースト確認 → 自動で詳細モーダルに戻る
6. 同様に「塩」(0 円、デフォ OFF、並び順 2)、「おろしポン酢」(50 円、デフォ OFF、並び順 3) を追加
7. 詳細モーダルに 3 選択肢が一覧表示され、価格差分が「±0」「±0」「+¥50」と正しく表示されることを確認
8. 「閉じる」ボタンで詳細モーダルを閉じる
9. グループ一覧の「味付け」行の選択肢数が「3」になっていることを確認

**DB 確認**:
```sql
SELECT o.option_id, o.display_id, o.name, o.price_delta, o.is_default, o.sort_order
FROM options o
JOIN option_groups g ON g.group_id = o.group_id
WHERE g.name = '味付け'
ORDER BY o.sort_order;
```
**期待結果**: 3 行（タレ / 塩 / おろしポン酢）、全て `OPT-xxxxxxx` display_id、price_delta int、タレだけ is_default=true

---

### ④ 商品紐付け: 居酒屋潮の「鶏つくね」商品を編集

**手順**:
1. サイドバー「🍽️ メニュー管理」に移動
2. 検索 input に居酒屋潮の `BRD-xxxxxxx` を入力 → 「🔍 検索」
3. ブランドが開き、メニューパターンが表示される（既存の default パターンを選択）
4. 商品一覧から「鶏つくね」を探す（存在しない場合は別の任意商品を使用）
5. 「✏️」編集ボタンをクリック
6. モーダルの下部に「オプショングループ」セクションが追加されていることを確認
7. 「味付け」チェックボックスを ON、右側の select は「デフォルト使用」のまま
8. 「保存」ボタンクリック
9. トースト「✅ 商品を更新しました」を確認

**DB 確認**:
```sql
SELECT pog.id, pog.sort_order, pog.is_required,
       p.name AS product_name, g.name AS group_name
FROM product_option_groups pog
JOIN products p ON p.id = pog.product_id
JOIN option_groups g ON g.group_id = pog.group_id
WHERE p.name = '鶏つくね';  -- ← 実際の商品名に置換
```
**期待結果**: 1 行（商品名 + グループ名「味付け」、is_required=NULL）

---

### ⑤ DB 総合確認

**Supabase Dashboard SQL Editor で以下を実行**:

```sql
-- グループ数
SELECT COUNT(*) AS group_count FROM option_groups;

-- 選択肢数
SELECT COUNT(*) AS option_count FROM options;

-- 商品紐付け数
SELECT COUNT(*) AS pog_count FROM product_option_groups;
```

**期待結果**:
- group_count >= 1（step ② で作成した「味付け」）
- option_count >= 3（step ③ で作成した 3 選択肢）
- pog_count >= 1（step ④ で作成した商品紐付け）

---

### ⑥ bulk-import Excel 生成確認

**手順**:
1. サイドバー「🍽️ メニュー管理」→ 右上の「📋 テンプレートDL」ボタンをクリック
2. `weir_menu_full_template.xlsx` がダウンロードされることを確認
3. Excel で開く → シート タブを確認
4. **5 つのシートが表示されることを確認**:
   - `1_カテゴリ`
   - `2_メニュー商品`
   - `3_オプショングループ`
   - `4_オプション選択肢`
   - `5_商品オプション連携`
5. さらに「商品フラグ一覧」シート（既存）も表示されていることを確認

**シート 3 「3_オプショングループ」の内容確認**:
- ヘッダー: `ブランドスラッグ*` / `グループ名*` / `選択タイプ*(single/multiple)` / `必須(ON/OFF)` / `並び順` / `利用可能(ON/OFF)`
- sample データ: 3 行（味付け / トッピング / サイズバリエーション）
- 選択タイプ列にドロップダウン（single / multiple）が表示されることを確認
- 必須・利用可能列にドロップダウン（ON / OFF）が表示されることを確認

**シート 4 「4_オプション選択肢」の内容確認**:
- ヘッダー: `ブランドスラッグ*` / `グループ名*` / `選択肢名*` / `価格差分(円)` / `デフォルト(ON/OFF)` / `並び順` / `利用可能(ON/OFF)`
- sample データ: 4 行（タレ / 塩 / おろしポン酢 / エクストラチーズ）

**シート 5 「5_商品オプション連携」の内容確認**:
- ヘッダー: `ブランドスラッグ*` / `商品名*` / `グループ名*` / `並び順` / `必須上書き(空欄=デフォルト/ON/OFF)`
- sample データ: 3 行

---

### ⑦ bulk-import テスト投入（任意、Taisei 判断）

**目的**: 3 新規型の bulk-import 機能動作確認

**手順（スキップ可）**:
1. サイドバー「🍽️ メニュー管理」→「インポート」ボタン → bulk-import ページへ遷移
2. データ種別セレクトに新しく以下 3 項目が表示されていることを確認:
   - オプショングループ
   - オプション選択肢
   - 商品オプション連携
3. （任意）空テンプレートを DL → 1-2 行編集して居酒屋潮用データを作成 → preview → execute
4. （任意）投入後、手順 ⑤ の DB 確認 SQL で件数が増えていることを確認

**投入順序制約（重要）**:
「メニュー一括（カテゴリ＋商品＋オプション）」から個別シート投入する際は、**必ず以下の順序**:
1. 「メニューカテゴリ」（シート1）
2. 「メニュー商品」（シート2）
3. 「オプショングループ」（シート3）
4. 「オプション選択肢」（シート4）
5. 「商品オプション連携」（シート5）

理由: 下流のシートは上流のシートで作成されたレコードを `brand_slug + name` で lookup するため。

---

## 完了報告テンプレート

以下を Taisei → CC に連絡:

```
Smoke Test 結果:
- ① オプション管理タブ表示: PASS/FAIL
- ② グループ作成「味付け」: PASS/FAIL
- ③ 選択肢 3 件作成: PASS/FAIL
- ④ 商品「鶏つくね」紐付け: PASS/FAIL
- ⑤ DB 総合確認: group N / option N / pog N
- ⑥ Excel 5 シート確認: PASS/FAIL
- ⑦ bulk-import テスト投入: PASS/FAIL/SKIP

Issue（もしあれば）:
- 項目:
- 症状:
- ブラウザコンソール内容（F12 で確認）:
- スクリーンショット:
```

---

## 既知の制限事項（Stage 1）

- **品切れ管理 UI 未実装**: `option_sale_status` テーブルは作成済みだが、UI は Stage 2 で実装。データ投入・閲覧は現状 Dashboard SQL Editor からのみ
- **ブランドページ/受注アプリ連携未実装**: 注文フォームでのオプション選択 UI は Stage 2 で実装
- **Stripe 決済連携未実装**: `price_delta` の合計計算は Stage 2 で実装
- **bulk-import UPDATE で is_required=NULL リセット不可**: パーシャル更新の仕組み上、`is_required` を既存値から NULL に戻すには UI で編集する必要あり
