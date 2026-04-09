import { requireAuth } from '../_lib/auth.js';
import { handleCors, ok, error } from '../_lib/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { url } = req.body || {};
  if (!url) return error(res, 'url is required', 400);

  try {
    const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.FIRECRAWL_API_KEY,
      },
      body: JSON.stringify({ url, formats: ['extract'], extract: {
        prompt: 'Extract the main brand color (primary color) and secondary/accent color as hex codes. Return as JSON with keys mainColor and subColor.'
      }}),
    });
    const fcData = await fcRes.json();
    const extracted = fcData?.data?.extract || {};
    return ok(res, {
      mainColor: extracted.mainColor || null,
      subColor: extracted.subColor || null,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
}
