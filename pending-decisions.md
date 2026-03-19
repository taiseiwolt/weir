# オーナー判断待ちリスト

## 調査日: 2026-03-18

---

### 1. 注文作成フローの統一

**現状:**
- `aiden-order-checkout.html` は Edge Function (`stripe-create-payment-intent`) を使用
  → Stripe PaymentIntent のみ作成、orders テーブルへの INSERT なし
- `api/orders/[...path].js` は POST ハンドラで orders + order_items テーブルに INSERT
  → 正しいサーバーサイドフロー

**提案:** checkout.html を API パス (`POST /api/orders`) に移行

**メリット:**
- サーバーサイドで価格計算（改ざん防止）
- orders テーブルへの確実な書き込み
- order_id が point_transactions に設定可能
- Dashboard のリアルタイム購読が機能する

**影響範囲:** checkout.html の決済フロー全体

---

### 2. members 集計値の DB トリガー化

**現状:** `total_spend`, `monthly_order_count` はクライアントJS (checkout.html 行 2080-2083) で更新

**提案:** orders テーブルに INSERT/UPDATE トリガーを追加して自動集計

```sql
CREATE OR REPLACE FUNCTION update_member_order_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE members SET
    total_spend = (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE member_id = NEW.member_id AND status != 'cancelled'),
    monthly_order_count = (SELECT COUNT(*) FROM orders WHERE member_id = NEW.member_id AND created_at >= date_trunc('month', now()))
  WHERE id = NEW.member_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**メリット:** データの信頼性向上、ブラウザ切断時の不整合防止
**リスク:** DB負荷増加（orders 書き込み毎にサブクエリ実行）

---

### 3. admin.html のメニュー表示を Supabase 接続に移行

**現状:** 11品のハードコード配列
**提案:** `products`, `categories` テーブルから SELECT

**影響範囲:** admin.html のメニュー表示セクション全体
**前提条件:** admin.html のRLS/認証戦略の決定が必要

---

### 4. admin.html の認証機能追加

**現状:** anon key で全操作実行（認証なし）
**問題:** members テーブルの RLS ポリシーが `auth.uid() = auth_user_id` のため、anon key ではデータ取得不可（フォールバックでデモデータを表示）

**選択肢:**
- A. service_role key を使用（セキュリティリスク高・プロトタイプ向け）
- B. Supabase Auth でログイン実装 + `accounts` テーブルでロール判定
- C. APIサーバー経由でデータ取得（service_role は API 側に隠蔽）

---

### 5. 会員チャネル別注文分布の実データ化

**現状:** customer-admin.html 行 4875 でチャネル分布を固定比率で合成:
```javascript
channel: { dineIn: 55%, takeout: 30%, delivery: 15% }
```

**提案:** orders テーブルの `order_type` を集計して実データを表示

---

### 6. monthly_order_count のリセット戦略

**現状:** checkout.html でインクリメントされるが、月初リセットのロジックが存在しない
**提案:** pg_cron で月初に全会員の `monthly_order_count` を 0 にリセット

```sql
SELECT cron.schedule('reset-monthly-orders', '0 0 1 * *',
  $$UPDATE members SET monthly_order_count = 0$$
);
```
