-- SEC-11: orders テーブルの PII カラムに対する anon ロールのアクセスを REVOKE
-- 問題: anon SELECT で delivery_address, customer_name, customer_email, customer_phone が露出
-- 対策: カラムレベルの GRANT/REVOKE で PII カラムへの anon アクセスを制限
-- これにより select=* でもPIIカラムは返されない

-- まず anon に orders テーブル全体の SELECT を REVOKE
REVOKE SELECT ON orders FROM anon;

-- PII を除外したカラムのみ anon に SELECT を GRANT
GRANT SELECT (
  id, display_id, store_id, brand_id, corp_id,
  order_type, status, total_amount,
  tracking_token, tracking_status, tracking_expires_at,
  payment_status, payment_intent_id, payment_method, stripe_payment_intent_id,
  estimated_delivery_at, estimated_minutes,
  channel, notes, pickup_at,
  delivery_fee, service_fee, surcharge_amount, application_fee_amount,
  aiden_points_used, normal_points_used,
  refund_amount, refund_reason, refunded_at, refunded_by,
  guest_id, member_id, card_fingerprint,
  created_at, updated_at
) ON orders TO anon;

-- 除外カラム: delivery_address, delivery_lat, delivery_lng, customer_name, customer_email, customer_phone
-- NOTE: member_id と guest_id は注文者識別に必要なため残す（PII自体ではない）
-- NOTE: card_fingerprint は重複検知用のハッシュ値でPIIではない
