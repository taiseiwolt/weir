# `order_items.selected_options` JSONB スキーマ仕様

> **対象**: CC-Option-Master-Stage2a Phase 1 以降の実装者
> **関連**: D-242 (Stage 1 β 採用) / D-166 (metadata 整理) / Taisei 確認1 案A (2026-04-23)
> **migration**: `supabase/migrations/20260423800000_order_items_selected_options.sql`

---

## なぜ JSONB なのか（採用理由）

Taisei 確認1 案A「`order_items` に `selected_options jsonb NOT NULL DEFAULT '[]'::jsonb` を追加する」を採用。

他の候補（案B: `order_item_options` 中間テーブル新設 / 案C: Stripe metadata に寄せる）を退けた理由:

| 観点 | 案A (JSONB) | 案B (中間テーブル) | 案C (Stripe metadata) |
|------|------------|-----------------|----------------------|
| 最小変更 | 1 カラム追加のみ | テーブル新設 + FK + RLS 一式 | EF / Webhook で都度復元が必要 |
| クエリ可能性 | GIN index で jsonb パスクエリ可 | SQL JOIN で素直 | 復元前はクエリ不可 |
| 冪等性 | snapshot のため option master 変更に影響されない | FK 経由のため master 変更の影響を受ける | metadata 欠損リスク |
| metadata 統一 | `orders.metadata` / `order_items.metadata` と同一方針 | 他と設計思想が分岐 | source of truth が外部化 |
| 履歴保全 | option 削除後も `option_name` で復元可 | FK が `ON DELETE SET NULL` の場合のみ | Stripe 側保持に依存 |

**Source of Truth**: 注文内容の正は常に DB (`order_items.selected_options`)。Stripe metadata は補助情報のみで、cart 内容全文は入れない (metadata 500 文字制限と PII 混入リスクのため)。

---

## スキーマ構造（型定義）

`selected_options` は **Array of Object**。各要素は 1 つの選択されたオプション (`options` テーブルの 1 行) に対応する。

### TypeScript 型

```ts
type SelectedOption = {
  option_id: string;    // UUID (options.option_id への参照、ただし FK 制約なし - snapshot)
  option_name: string;  // options.name のスナップショット (master 削除後も表示可能にするため必須)
  group_id: string;     // UUID (option_groups.group_id への参照)
  group_name: string;   // option_groups.name のスナップショット
  price_delta: number;  // int 円、0 / 正値 / 負値いずれも可 (options.price_delta スナップショット)
};

type OrderItemSelectedOptions = SelectedOption[];
```

### JSON Example

```json
[
  {
    "option_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "option_name": "タレ",
    "group_id": "11111111-2222-3333-4444-555555555555",
    "group_name": "味付け",
    "price_delta": 0
  },
  {
    "option_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "option_name": "煮玉子トッピング",
    "group_id": "66666666-7777-8888-9999-aaaaaaaaaaaa",
    "group_name": "トッピング",
    "price_delta": 150
  },
  {
    "option_id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "option_name": "小サイズ",
    "group_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    "group_name": "サイズ",
    "price_delta": -100
  }
]
```

**空配列 `[]`** の場合、その order_item にはオプション選択なし（オプションを持たない商品 / オプション任意で未選択）を意味する。DEFAULT 値もこの空配列。

---

## 各フィールドの詳細

### `option_id` (UUID, 必須)

- `options.option_id` への論理参照（FK 制約は**貼らない** — option master 削除後も行を残すため）
- 集計クエリの主キーとして使用（「煮玉子トッピングの採用率」等の分析で `option_id` で GROUP BY）
- UI での「注文詳細 → この option を再注文」リンク生成に使用

### `option_name` (text, 必須)

- `options.name` のスナップショット
- **削除後の履歴表示に必須**: option master が削除された後も、過去の注文履歴で「何を注文したか」を読める状態を保つ
- UI 表示文字列の source of truth（カート / 注文詳細 / 領収書 / メール通知すべて同じ値を使う）

### `group_id` (UUID, 必須)

- `option_groups.group_id` への論理参照
- 同じ group 内で複数 option が選ばれている場合（`selection_type='multiple'`）のグルーピング表示に使用
- 例: `[味付け]タレ / [トッピング]煮玉子・ねぎ増し` のような表示で group ごとに束ねる

### `group_name` (text, 必須)

- `option_groups.name` のスナップショット
- option master 削除後の履歴表示用（option_name と同じ理由）

### `price_delta` (integer, 必須)

- `options.price_delta` のスナップショット（int 円、負値可）
- **注文合計の再計算根拠**: `order_item.unit_price` を求める際、`product.price + Σ(price_delta)` で算出したスナップショット値
- 合計再計算の検算に使う:
  ```sql
  SELECT
    oi.id,
    oi.quantity,
    oi.unit_price,
    oi.unit_price * oi.quantity AS line_total,
    (SELECT SUM((opt->>'price_delta')::int)
     FROM jsonb_array_elements(oi.selected_options) opt) AS option_delta_sum
  FROM order_items oi
  WHERE oi.order_id = '...';
  ```

---

## GIN index 用途と集計クエリ例

### なぜ GIN index か

`selected_options` は jsonb 配列なので、「特定の option_id を含む order_items」を検索するクエリは `@>` コンテインメント演算子で書く。
GIN index が無いと全行スキャンになるため、集計クエリ・管理画面でのフィルタリング性能のために必須。

### 集計クエリ例 1: 煮玉子トッピングの採用率

```sql
-- 過去 30 日間の「煮玉子トッピング」採用率
WITH target_option AS (
  SELECT option_id FROM options WHERE name = '煮玉子トッピング' LIMIT 1
),
stats AS (
  SELECT
    COUNT(*) FILTER (
      WHERE oi.selected_options @> jsonb_build_array(
        jsonb_build_object('option_id', (SELECT option_id FROM target_option)::text)
      )
    ) AS adopted_count,
    COUNT(*) AS total_count
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.created_at > NOW() - INTERVAL '30 days'
)
SELECT
  adopted_count,
  total_count,
  ROUND(100.0 * adopted_count / NULLIF(total_count, 0), 2) AS adoption_rate_pct
FROM stats;
```

### 集計クエリ例 2: グループ別の選択分布

```sql
-- 「味付け」グループで選ばれた option ごとの件数
SELECT
  opt->>'option_name' AS option_name,
  COUNT(*) AS pick_count
FROM order_items oi,
     jsonb_array_elements(oi.selected_options) opt
WHERE opt->>'group_name' = '味付け'
GROUP BY opt->>'option_name'
ORDER BY pick_count DESC;
```

### 集計クエリ例 3: 特定 option を含む注文一覧

```sql
-- option_id = '...' を含む全 order_items
SELECT oi.*
FROM order_items oi
WHERE oi.selected_options @> '[{"option_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890"}]'::jsonb;
-- GIN index が効く (@> 演算子)
```

---

## 使用例

### INSERT: `stripe-create-payment-intent` での値構築

Edge Function / Vercel Serverless で `order_items` に行を INSERT する際の構築例:

```js
// Cart の 1 item → order_items row
const selectedOptions = (cartItem.selectedOptionObjects || []).map(opt => ({
  option_id: opt.option_id,
  option_name: opt.name,           // snapshot
  group_id: opt.group_id,
  group_name: opt.group_name,      // snapshot
  price_delta: opt.price_delta,    // snapshot (int)
}));

await supabase.from('order_items').insert({
  order_id: orderId,
  product_id: cartItem.productId,
  product_name: cartItem.productNameSnapshot,
  quantity: cartItem.qty,
  unit_price: cartItem.unitPrice,  // product.price + Σ(price_delta)
  selected_options: selectedOptions, // NOT NULL, DEFAULT '[]'::jsonb
});
```

**重要**: FK 制約は貼っていないので、option が削除されても INSERT は拒絶されない（想定内）。削除後の注文履歴では `option_name` / `group_name` のスナップショット文字列で表示する。

### SELECT: 管理画面での一覧表示

```js
// 注文詳細画面で selected_options を取得
const { data: items } = await supabase
  .from('order_items')
  .select('id, product_name, quantity, unit_price, selected_options')
  .eq('order_id', orderId);

// 各 item の selected_options は array of object
items.forEach(item => {
  const optText = (item.selected_options || [])
    .map(o => o.option_name)
    .join(' / ');
  console.log(`${item.product_name} × ${item.quantity} [${optText}]`);
});
```

### 表示: カート / 注文履歴での併記

カート / 注文履歴 / 領収書 / 顧客通知メールでは、`option_name` / `group_name` をそのまま文字列として表示する。`escH()` によるエスケープは `innerHTML` 代入時に必須。

```js
// カート表示 (weir-order-store.html)
const optText = (cartItem.selected_options_rendered || [])
  .map(o => o.option_name)
  .join(' / ');
el.innerHTML = `
  <div class="order-item-name">${escH(cartItem.product_name)}</div>
  ${optText ? `<div class="order-item-options">${escH(optText)}</div>` : ''}
`;
```

### 金額再計算（検算用）

```sql
-- order_items.unit_price が「product.price + Σ(price_delta)」と一致するかチェック
SELECT
  oi.id,
  oi.unit_price,
  p.price AS product_price,
  COALESCE((
    SELECT SUM((opt->>'price_delta')::int)
    FROM jsonb_array_elements(oi.selected_options) opt
  ), 0) AS options_delta,
  (p.price + COALESCE((
    SELECT SUM((opt->>'price_delta')::int)
    FROM jsonb_array_elements(oi.selected_options) opt
  ), 0)) AS expected_unit_price
FROM order_items oi
JOIN products p ON p.id = oi.product_id
WHERE oi.unit_price <> (p.price + COALESCE((
  SELECT SUM((opt->>'price_delta')::int)
  FROM jsonb_array_elements(oi.selected_options) opt
), 0));
-- 0 行なら全件整合。1 行以上なら不整合あり → 調査
```

---

## Stripe metadata との関係

- **Source of Truth は DB** (`order_items.selected_options`)。Stripe metadata には cart 内容全文を入れない。
- Stripe metadata に入れるのは最小限の参照キーのみ（例: `order_id`, `venue_id`, `payment_type`）。500 文字制限と PII 混入リスクを避けるため。
- Webhook で決済確定後に `orders.status` を更新する際、cart 内容は DB から取得する。metadata は「どの order を更新するか」の識別子のみに使う。

| 情報 | DB (`order_items.selected_options`) | Stripe metadata |
|------|-----------------------------------|-----------------|
| cart 全内容 | 保持 (source of truth) | 入れない |
| option_id / name | 保持 (snapshot 含む) | 入れない |
| price_delta | 保持 (snapshot) | 入れない |
| order_id 参照 | 保持 (`order_items.order_id`) | 保持 (識別子として) |

---

## name スナップショット必須の理由（再掲）

`option_name` / `group_name` を JSONB 内に重複保持することは一見冗長に見えるが、以下の理由で必須:

1. **option master 削除後の履歴保全**: 加盟店がメニュー改定で option を削除しても、過去の注文履歴は「何を注文したか」を読める状態でなければならない（返品対応 / 会計監査 / 顧客問い合わせ）
2. **FK 制約を貼らない設計の帰結**: FK を貼ると option master を削除する際に `ON DELETE SET NULL` 等の対応が必要。代わりにスナップショットで保全する
3. **表示 UI の単純化**: 過去注文の表示時に option master を JOIN する必要がない（読み取り性能の観点からも有利）

---

## Phase 1 以降の実装マップ

| Phase | 対象ファイル / 処理 | 担当 |
|-------|---------------------|------|
| Phase 1 (本 migration + schema 移行) | `weir-order-store.html` schema 参照のみ修正 | CC-Option-Master-Stage2a Phase 1 |
| Phase 2 | `weir-order-store.html` 選択 UI + 価格計算 + cart data shape 整備 | CC-Option-Master-Stage2a Phase 2 |
| Phase 3 | `api/stripe-create-payment-intent.js` / Edge Function で `selected_options` を INSERT | CC-Option-Master-Stage2a Phase 3 |
| Phase 4 | 管理画面 (`weir-customer-admin.html` 等) で `selected_options` を表示 | CC-Option-Master-Stage2a Phase 4 |
| Phase 5 | main merge + production 反映 | CC-Option-Master-Stage2a Phase 5 |

本 Phase 1 で DB 基盤 + schema 参照の修正のみ完了。実 INSERT / 表示は Phase 2 以降で段階実装。
