-- RPC: get_order_by_tracking_token
-- tracking_token をキーにして注文データを返す関数
-- anon role でも delivery_address / delivery_lat / delivery_lng を含む
-- 注文データにアクセスできる（tracking_token が bearer token の役割）

CREATE OR REPLACE FUNCTION public.get_order_by_tracking_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'id', o.id,
    'display_id', o.display_id,
    'store_id', o.store_id,
    'order_type', o.order_type,
    'total_amount', o.total_amount,
    'delivery_fee', o.delivery_fee,
    'service_fee', o.service_fee,
    'tracking_status', o.tracking_status,
    'tracking_token', o.tracking_token,
    'tracking_expires_at', o.tracking_expires_at,
    'estimated_minutes', o.estimated_minutes,
    'estimated_delivery_at', o.estimated_delivery_at,
    'delivery_address', o.delivery_address,
    'delivery_lat', o.delivery_lat,
    'delivery_lng', o.delivery_lng,
    'created_at', o.created_at,
    'order_items', COALESCE((
      SELECT json_agg(json_build_object(
        'id', oi.id,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'subtotal', oi.subtotal,
        'products', CASE WHEN p.id IS NOT NULL THEN json_build_object(
          'id', p.id,
          'name', p.name,
          'image_url', p.image_url
        ) ELSE NULL END
      ))
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), '[]'::json),
    'stores', json_build_object(
      'id', s.id,
      'name', s.name,
      'address', s.address,
      'phone', s.phone,
      'lat', s.lat,
      'lng', s.lng,
      'brands', json_build_object(
        'id', b.id,
        'name', b.name,
        'primary_color', b.primary_color
      )
    )
  ) INTO result
  FROM orders o
  INNER JOIN stores s ON s.id = o.store_id
  LEFT JOIN brands b ON b.id = s.brand_id
  WHERE o.tracking_token = p_token;

  RETURN result;
END;
$$;

-- anon role に実行権限を付与
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token(text) TO authenticated;
