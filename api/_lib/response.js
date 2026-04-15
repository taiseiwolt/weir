const ALLOWED_ORIGINS = [
  'https://weir.co.jp',
  'https://taiseiwolt.github.io',
  'https://weir.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

/**
 * Set CORS headers on response.
 */
export function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Handle OPTIONS preflight.
 * Returns true if preflight was handled (caller should return).
 */
export function handleCors(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Send success response.
 */
export function ok(res, data, status = 200) {
  return res.status(status).json(data);
}

/**
 * Send error response.
 */
export function error(res, message, status = 400, code = null) {
  const body = { error: message };
  if (code) body.code = code;
  return res.status(status).json(body);
}
