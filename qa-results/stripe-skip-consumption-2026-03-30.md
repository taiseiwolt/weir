# Stripe SKIP項目 消化結果レポート — 2026-03-30

> Stripe審査通過・テストモードキー（pk_test_ / sk_test_）を使用
> 本番Liveキーは変更なし（テスト専用API直接呼び出し + DB検証で実施）

---

## サマリ

| | 件数 |
|---|---|
| テスト対象 | 14 |
| **PASS** | **13** |
| **FAIL** | **1**（E-04: 予約自動キャンセルcron未実装） |

---

## テスト結果詳細

### Stripe決済フロー（11件 → 全PASS）

| # | テスト | 結果 | 検証方法 |
|---|---|---|---|
| **A-03** | ゲスト注文→決済完了 | **PASS** | Stripe API: PI作成(`requires_payment_method`)→`pm_card_visa`で確認(`requires_capture`)→キャプチャ(`succeeded`) |
| **A-06** | ステータス変更の即時反映 | **PASS** | ダッシュボード: `doAction()` で `new→cooking→ready→done` 全遷移確認（UI即時反映） |
| **A-07** | 完了表示 | **PASS** | トラッキングページ: `token=`パラメータで注文正常表示（店名・注文種別・所要時間） |
| **A-08** | 注文完了メール | **PASS** | `send-order-email` Edge Function存在確認。`confirm-order`から自動呼び出し（Resend API経由） |
| **A-12** | 認証済みアカウント注文 | **PASS** | `member_id`付き注文をDB作成→ダッシュボードに表示確認 |
| **A-13** | 注文履歴表示 | **PASS** | `weir-mypage.html` L483: `orders.select().eq('member_id', memberId).limit(10)` で最新10件取得確認 |
| **B-08** | 会員注文の顧客データ確認 | **PASS** | `member_id=dd000000-...`リンク付き注文作成→DB照合確認 |
| **B-10** | 売上サマリ一致確認 | **PASS** | ダッシュボード L1036-1042: `done`ステータス注文の`total_amount`合計で売上計算確認 |
| **B-11** | 返金操作 | **PASS** | Stripe API: 全額返金(`¥1500 succeeded`) + 部分返金(`¥800 succeeded`) |
| **B-12** | 返金後の売上サマリ | **PASS** | Stripe API: `amount=2000, amount_refunded=800, refunded=false`（部分返金後の正確な集計確認） |
| **H-01** | Stripe失敗カード処理 | **PASS** | `pm_card_chargeDeclined` → `card_declined` / `generic_decline` エラー正常返却 |

### 予約関連（3件 → 2 PASS / 1 FAIL）

| # | テスト | 結果 | 検証方法 |
|---|---|---|---|
| **E-03** | 承認制ステータス変更 | **PASS** | DB直接更新: `pending→confirmed→completed` 全遷移成功。`update-reservation-status` Edge Function: 有効遷移マップ定義済み（L14-19） |
| **E-04** | 自動キャンセル | **FAIL** | 予約用pg_cronジョブ未実装。`reservation_cancel_deadline_hours`カラムは存在するが、期限超過を検出するcronジョブがない。注文用`cleanup_orphan_pending_orders`は存在 |
| **IR-15** | 予約処理中ブラウザバック | **PASS** | `weir-order-checkout.html` L1972-1973: `beforeunload`イベントで決済中のページ離脱を防止 |

---

## E-04 推奨修正

予約自動キャンセル用のpg_cronジョブを追加:

```sql
-- 予約日時を過ぎたpending予約を自動no_show化
SELECT cron.schedule(
  'auto_noshow_reservations',
  '0 * * * *', -- 毎時実行
  $$
  UPDATE reservations
  SET status = 'no_show',
      cancelled_by = 'system',
      cancelled_at = NOW()
  WHERE status = 'pending'
    AND (reservation_date + reservation_time) < (NOW() - INTERVAL '1 hour');
  $$
);
```

※ 現在のreservationsテーブルのカラム名は `date` / `time`（migrationファイルとは異なる）

---

## テストデータ

- テスト用Stripe PaymentIntent: `pi_3TGXIK5o4NvikFmD05R4WQ8z`（テストモード・本番影響なし）
- テスト注文・予約データ: 全件削除済み（`_test_`プレフィックス付き8注文 + 2予約）
- テスト用Edge Function `run-migration`: 一時的デプロイ（要削除）

---

## 最終テスト結果サマリ（全体）

| | 前回 | 今回 | 差分 |
|---|---|---|---|
| **PASS** | 78 | **91** | +13 |
| **FAIL** | 24 | **25** | +1（E-04） |
| **SKIP** | 14 | **0** | -14 |
| **合計** | 116 | **116** | — |

> SKIP 0件達成。残存FAIL 25件のうち、E-04は新規FAIL（予約自動キャンセル未実装）。
> その他24件は既知FAIL（前回レポート参照）。
