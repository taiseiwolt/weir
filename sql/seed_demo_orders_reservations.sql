-- =============================================================
-- Flutter UIUX v2 デモデータ: 注文 + 来店予約
-- 注文15件: 全ステータス × 全注文タイプ × 全支払いステータス網羅
--   order_type: dinein, pickup, delivery
--   status: pending_confirmation, cooking, ready, completed, cancelled
--   payment_status: unpaid, captured, paid, failed, refunded
-- 予約20件: 全6ステータス網羅
--   status: pending(4), confirmed(4), cancel_requested(3),
--           cancelled(3), no_show(3), completed(3)
-- テストデータには _test_ プレフィックスを付与
-- =============================================================

-- -----------------------------------------------------------
-- 0. 競合チェック（先にSELECTで確認用）
-- -----------------------------------------------------------
-- SELECT id, display_id FROM orders WHERE display_id LIKE '_test_%';
-- SELECT id, display_id FROM reservations WHERE display_id LIKE '_test_%';

-- -----------------------------------------------------------
-- 1. 既存テストデータのクリーンアップ
-- -----------------------------------------------------------
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE display_id LIKE '_test_%'
);
DELETE FROM orders WHERE display_id LIKE '_test_%';
DELETE FROM reservations WHERE display_id LIKE '_test_%';

-- -----------------------------------------------------------
-- 2. 注文データ (15件)
-- -----------------------------------------------------------
-- 使用する既存ID:
--   store: 0e68b622-... (いきなり渋谷)
--   store: 6f2f6146-... (いきなり神田)
--   store: e2cf6b39-... (いきなり新橋)
--   brand: 22222222-0000-0000-0000-000000000002 (いきなり！ステーキ)

INSERT INTO orders (
  id, display_id, store_id, brand_id, member_id,
  order_type, status, payment_status,
  total_amount, channel,
  customer_name, customer_email, customer_phone,
  created_at, updated_at
) VALUES
-- pending_confirmation + captured (dinein)
('aaaaaaaa-7e57-0001-0000-000000000001', '_test_ORD-0001', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'dinein', 'pending_confirmation', 'captured', 1980, 'aiden',
 '_test_田中太郎', 'test01@example.com', '090-0000-0001',
 NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes'),

-- pending_confirmation + captured (pickup)
('aaaaaaaa-7e57-0002-0000-000000000002', '_test_ORD-0002', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'pickup', 'pending_confirmation', 'captured', 2480, 'aiden',
 '_test_佐藤花子', 'test02@example.com', '090-0000-0002',
 NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '10 minutes'),

-- cooking + captured (dinein)
('aaaaaaaa-7e57-0003-0000-000000000003', '_test_ORD-0003', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'dinein', 'cooking', 'captured', 3200, 'aiden',
 '_test_鈴木一郎', 'test03@example.com', '090-0000-0003',
 NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '15 minutes'),

-- cooking + captured (delivery)
('aaaaaaaa-7e57-0004-0000-000000000004', '_test_ORD-0004', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'delivery', 'cooking', 'captured', 2980, 'aiden',
 '_test_伊藤健二', 'test04@example.com', '090-0000-0004',
 NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '20 minutes'),

-- ready + captured (pickup)
('aaaaaaaa-7e57-0005-0000-000000000005', '_test_ORD-0005', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'pickup', 'ready', 'captured', 1650, 'aiden',
 '_test_高橋美咲', 'test05@example.com', '090-0000-0005',
 NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '20 minutes'),

-- ready + captured (delivery)
('aaaaaaaa-7e57-0006-0000-000000000006', '_test_ORD-0006', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'delivery', 'ready', 'captured', 1480, 'aiden',
 '_test_渡辺直美', 'test06@example.com', '090-0000-0006',
 NOW() - INTERVAL '50 minutes', NOW() - INTERVAL '25 minutes'),

-- completed + paid (dinein)
('aaaaaaaa-7e57-0007-0000-000000000007', '_test_ORD-0007', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'dinein', 'completed', 'paid', 4500, 'aiden',
 '_test_山本和也', 'test07@example.com', '090-0000-0007',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'),

-- completed + paid (pickup)
('aaaaaaaa-7e57-0008-0000-000000000008', '_test_ORD-0008', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'pickup', 'completed', 'paid', 2200, 'aiden',
 '_test_中村さくら', 'test08@example.com', '090-0000-0008',
 NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours'),

-- completed + paid (delivery)
('aaaaaaaa-7e57-0009-0000-000000000009', '_test_ORD-0009', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'delivery', 'completed', 'paid', 3800, 'aiden',
 '_test_小林大輔', 'test09@example.com', '090-0000-0009',
 NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours'),

-- cancelled + refunded
('aaaaaaaa-7e57-0010-0000-000000000010', '_test_ORD-0010', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'pickup', 'cancelled', 'refunded', 1800, 'aiden',
 '_test_加藤裕子', 'test10@example.com', '090-0000-0010',
 NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours'),

-- cancelled + failed
('aaaaaaaa-7e57-0011-0000-000000000011', '_test_ORD-0011', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'dinein', 'cancelled', 'failed', 2750, 'aiden',
 '_test_松本翔太', 'test11@example.com', '090-0000-0011',
 NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours'),

-- pending_confirmation + unpaid
('aaaaaaaa-7e57-0012-0000-000000000012', '_test_ORD-0012', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'dinein', 'pending_confirmation', 'unpaid', 5200, 'aiden',
 '_test_吉田恵', 'test12@example.com', '090-0000-0012',
 NOW() - INTERVAL '1 hour', NOW() - INTERVAL '50 minutes'),

-- completed + refunded (返品返金)
('aaaaaaaa-7e57-0013-0000-000000000013', '_test_ORD-0013', '0e68b622-94fa-4832-b904-71140caf2bd3', '22222222-0000-0000-0000-000000000002', NULL,
 'delivery', 'completed', 'refunded', 6800, 'aiden',
 '_test_斎藤隆', 'test13@example.com', '090-0000-0013',
 NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),

-- 神田店: cooking
('aaaaaaaa-7e57-0014-0000-000000000014', '_test_ORD-0014', '6f2f6146-d258-480a-a0d8-c89345f64044', '22222222-0000-0000-0000-000000000002', NULL,
 'dinein', 'cooking', 'captured', 3300, 'aiden',
 '_test_木村拓哉', 'test14@example.com', '090-0000-0014',
 NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '5 minutes'),

-- 新橋店: completed
('aaaaaaaa-7e57-0015-0000-000000000015', '_test_ORD-0015', 'e2cf6b39-7e5d-41cc-9a39-50ab9cf78290', '22222222-0000-0000-0000-000000000002', NULL,
 'pickup', 'completed', 'paid', 1980, 'aiden',
 '_test_井上陽介', 'test15@example.com', '090-0000-0015',
 NOW() - INTERVAL '8 hours', NOW() - INTERVAL '7 hours');

-- -----------------------------------------------------------
-- 3. 注文明細 (order_items)
-- -----------------------------------------------------------
INSERT INTO order_items (
  id, order_id, product_id, quantity, unit_price, subtotal
) VALUES
('bbbbbbbb-7e57-0001-0000-000000000001', 'aaaaaaaa-7e57-0001-0000-000000000001', '55555555-0001-0000-0000-000000000001', 1, 1980, 1980),
('bbbbbbbb-7e57-0002-0000-000000000001', 'aaaaaaaa-7e57-0002-0000-000000000002', '55555555-0001-0000-0000-000000000002', 1, 1980, 1980),
('bbbbbbbb-7e57-0002-0000-000000000002', 'aaaaaaaa-7e57-0002-0000-000000000002', '55555555-0001-0000-0000-000000000010', 1, 500, 500),
('bbbbbbbb-7e57-0003-0000-000000000001', 'aaaaaaaa-7e57-0003-0000-000000000003', '55555555-0001-0000-0000-000000000003', 2, 1600, 3200),
('bbbbbbbb-7e57-0004-0000-000000000001', 'aaaaaaaa-7e57-0004-0000-000000000004', '55555555-0001-0000-0000-000000000004', 1, 2680, 2680),
('bbbbbbbb-7e57-0005-0000-000000000001', 'aaaaaaaa-7e57-0005-0000-000000000005', '55555555-0001-0000-0000-000000000005', 1, 1650, 1650),
('bbbbbbbb-7e57-0007-0000-000000000001', 'aaaaaaaa-7e57-0007-0000-000000000007', '55555555-0001-0000-0000-000000000006', 1, 2500, 2500),
('bbbbbbbb-7e57-0007-0000-000000000002', 'aaaaaaaa-7e57-0007-0000-000000000007', '55555555-0001-0000-0000-000000000001', 1, 2000, 2000),
('bbbbbbbb-7e57-0009-0000-000000000001', 'aaaaaaaa-7e57-0009-0000-000000000009', '55555555-0001-0000-0000-000000000007', 1, 3000, 3000),
('bbbbbbbb-7e57-0009-0000-000000000002', 'aaaaaaaa-7e57-0009-0000-000000000009', '55555555-0001-0000-0000-000000000010', 1, 500, 500),
('bbbbbbbb-7e57-0012-0000-000000000001', 'aaaaaaaa-7e57-0012-0000-000000000012', '55555555-0001-0000-0000-000000000001', 2, 1980, 3960),
('bbbbbbbb-7e57-0012-0000-000000000002', 'aaaaaaaa-7e57-0012-0000-000000000012', '55555555-0001-0000-0000-000000000008', 1, 1240, 1240),
('bbbbbbbb-7e57-0013-0000-000000000001', 'aaaaaaaa-7e57-0013-0000-000000000013', '55555555-0001-0000-0000-000000000006', 2, 2500, 5000),
('bbbbbbbb-7e57-0013-0000-000000000002', 'aaaaaaaa-7e57-0013-0000-000000000013', '55555555-0001-0000-0000-000000000009', 3, 500, 1500);

-- -----------------------------------------------------------
-- 4. 来店予約データ (20件)
-- -----------------------------------------------------------
-- 実テーブルカラム: id, store_id, member_id, display_id,
--   date, time, guest_count, type, name, phone, email, notes,
--   status, reminder_sent, created_at, updated_at

INSERT INTO reservations (
  id, store_id, display_id,
  date, time, guest_count, type,
  name, phone, email, notes,
  status, reminder_sent
) VALUES
-- === pending ×4 ===
('cccccccc-7e57-0001-0000-000000000001', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0001',
 '2026-04-04', '18:00', 2, 'reservation', '_test_山田太郎', '090-1111-0001', 'rsv01@example.com', NULL, 'pending', false),
('cccccccc-7e57-0002-0000-000000000002', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0002',
 '2026-04-04', '19:00', 4, 'reservation', '_test_岡田花子', '090-1111-0002', 'rsv02@example.com', 'アレルギー（卵）あり', 'pending', false),
('cccccccc-7e57-0003-0000-000000000003', '6f2f6146-d258-480a-a0d8-c89345f64044', '_test_RSV-0003',
 '2026-04-05', '12:00', 1, 'reservation', '_test_西村一郎', '090-1111-0003', 'rsv03@example.com', NULL, 'pending', false),
('cccccccc-7e57-0004-0000-000000000004', 'e2cf6b39-7e5d-41cc-9a39-50ab9cf78290', '_test_RSV-0004',
 '2026-04-06', '18:30', 6, 'reservation', '_test_藤田美咲', '090-1111-0004', 'rsv04@example.com', '誕生日ケーキ持ち込み希望', 'pending', false),

-- === confirmed ×4 ===
('cccccccc-7e57-0005-0000-000000000005', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0005',
 '2026-04-04', '12:00', 2, 'reservation', '_test_高橋健二', '090-1111-0005', 'rsv05@example.com', NULL, 'confirmed', false),
('cccccccc-7e57-0006-0000-000000000006', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0006',
 '2026-04-03', '19:30', 3, 'reservation', '_test_中島直美', '090-1111-0006', 'rsv06@example.com', '子供椅子1つ', 'confirmed', false),
('cccccccc-7e57-0007-0000-000000000007', '6f2f6146-d258-480a-a0d8-c89345f64044', '_test_RSV-0007',
 '2026-04-05', '18:00', 8, 'reservation', '_test_田村大輔', '090-1111-0007', 'rsv07@example.com', '接待利用。静かな席希望', 'confirmed', false),
('cccccccc-7e57-0008-0000-000000000008', 'e2cf6b39-7e5d-41cc-9a39-50ab9cf78290', '_test_RSV-0008',
 '2026-04-04', '20:00', 2, 'reservation', '_test_佐々木恵', '090-1111-0008', 'rsv08@example.com', NULL, 'confirmed', false),

-- === cancel_requested ×3 ===
('cccccccc-7e57-0009-0000-000000000009', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0009',
 '2026-04-04', '19:00', 2, 'reservation', '_test_松田翔太', '090-1111-0009', 'rsv09@example.com', '体調不良のため', 'cancel_requested', false),
('cccccccc-7e57-0010-0000-000000000010', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0010',
 '2026-04-03', '18:00', 4, 'reservation', '_test_井上陽子', '090-1111-0010', 'rsv10@example.com', '急用が入ったため', 'cancel_requested', false),
('cccccccc-7e57-0011-0000-000000000011', '6f2f6146-d258-480a-a0d8-c89345f64044', '_test_RSV-0011',
 '2026-04-05', '12:30', 2, 'reservation', '_test_木村拓也', '090-1111-0011', 'rsv11@example.com', '日程変更希望', 'cancel_requested', false),

-- === cancelled ×3 ===
('cccccccc-7e57-0012-0000-000000000012', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0012',
 '2026-04-02', '18:00', 2, 'reservation', '_test_渡辺裕子', '090-1111-0012', 'rsv12@example.com', '予定変更', 'cancelled', false),
('cccccccc-7e57-0013-0000-000000000013', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0013',
 '2026-04-01', '19:00', 6, 'reservation', '_test_加藤隆', '090-1111-0013', 'rsv13@example.com', '設備点検のため', 'cancelled', false),
('cccccccc-7e57-0014-0000-000000000014', 'e2cf6b39-7e5d-41cc-9a39-50ab9cf78290', '_test_RSV-0014',
 '2026-03-31', '20:00', 3, 'reservation', '_test_吉田恵美', '090-1111-0014', 'rsv14@example.com', '期限超過による自動キャンセル', 'cancelled', false),

-- === no_show ×3 ===
('cccccccc-7e57-0015-0000-000000000015', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0015',
 '2026-04-02', '19:00', 2, 'reservation', '_test_斎藤翔', '090-1111-0015', 'rsv15@example.com', NULL, 'no_show', false),
('cccccccc-7e57-0016-0000-000000000016', '6f2f6146-d258-480a-a0d8-c89345f64044', '_test_RSV-0016',
 '2026-04-01', '18:30', 4, 'reservation', '_test_前田一成', '090-1111-0016', 'rsv16@example.com', NULL, 'no_show', false),
('cccccccc-7e57-0017-0000-000000000017', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0017',
 '2026-03-31', '12:00', 1, 'reservation', '_test_小山真由美', '090-1111-0017', 'rsv17@example.com', NULL, 'no_show', false),

-- === completed ×3 ===
('cccccccc-7e57-0018-0000-000000000018', '0e68b622-94fa-4832-b904-71140caf2bd3', '_test_RSV-0018',
 '2026-04-02', '12:00', 2, 'reservation', '_test_森本和也', '090-1111-0018', 'rsv18@example.com', 'ランチ利用', 'completed', false),
('cccccccc-7e57-0019-0000-000000000019', '6f2f6146-d258-480a-a0d8-c89345f64044', '_test_RSV-0019',
 '2026-04-01', '18:00', 5, 'reservation', '_test_石田さくら', '090-1111-0019', 'rsv19@example.com', '会食利用', 'completed', false),
('cccccccc-7e57-0020-0000-000000000020', 'e2cf6b39-7e5d-41cc-9a39-50ab9cf78290', '_test_RSV-0020',
 '2026-04-02', '19:30', 3, 'reservation', '_test_大塚拓海', '090-1111-0020', 'rsv20@example.com', NULL, 'completed', false);

-- -----------------------------------------------------------
-- 5. 確認クエリ
-- -----------------------------------------------------------
SELECT 'orders' AS tbl, status, payment_status, order_type, COUNT(*) AS cnt
FROM orders WHERE display_id LIKE '_test_%'
GROUP BY status, payment_status, order_type
ORDER BY status, payment_status;

SELECT 'reservations' AS tbl, status, COUNT(*) AS cnt
FROM reservations WHERE display_id LIKE '_test_%'
GROUP BY status ORDER BY status;
