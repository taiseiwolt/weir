import { handleCors, ok, error } from '../_lib/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : rawPath.split('/');
  const action = pathSegments[0];

  if (action === 'quote') {
    return handleQuote(req, res);
  } else if (action === 'request') {
    return handleRequest(req, res);
  } else if (action) {
    // Treat as delivery ID
    return handleGetDelivery(req, res, action);
  }

  return error(res, 'Not found', 404);
}

function handleQuote(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { pickup_address, dropoff_address } = req.body || {};
  if (!pickup_address || !dropoff_address) {
    return error(res, 'pickup_address と dropoff_address が必要です');
  }

  return ok(res, {
    quote_id: 'quote_stub_' + Date.now(),
    estimated_fee: 350,
    estimated_duration_minutes: 25,
    currency: 'jpy',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    provider: 'stub',
    message: 'これはスタブレスポンスです。本番環境ではUber Direct等の配達APIに接続されます。',
  });
}

function handleRequest(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { order_id, pickup_address, dropoff_address } = req.body || {};
  if (!order_id || !pickup_address || !dropoff_address) {
    return error(res, 'order_id, pickup_address, dropoff_address が必要です');
  }

  return ok(res, {
    delivery_id: 'del_stub_' + Date.now(),
    status: 'pending',
    driver: null,
    estimated_pickup_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    estimated_dropoff_at: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    tracking_url: null,
    provider: 'stub',
    message: 'これはスタブレスポンスです。本番環境ではUber Direct等の配達APIに接続されます。',
  });
}

function handleGetDelivery(req, res, id) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  return ok(res, {
    delivery_id: id,
    status: 'in_progress',
    driver: {
      name: 'テスト配達員',
      phone: '080-0000-0000',
      vehicle: 'bicycle',
      lat: 35.6612,
      lng: 139.6987,
    },
    estimated_pickup_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    estimated_dropoff_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    tracking_url: null,
    provider: 'stub',
    message: 'これはスタブレスポンスです。本番環境ではUber Direct等の配達APIに接続されます。',
  });
}
