import { handleCors, setCors } from './_lib/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCors(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!firecrawlKey || !anthropicKey) {
    return res.status(500).json({ success: false, error: 'Missing API keys' });
  }

  try {
    // 1. Scrape URL with Firecrawl
    const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });

    if (!scrapeRes.ok) {
      const errBody = await scrapeRes.text();
      return res.status(502).json({ success: false, error: 'Firecrawl error: ' + errBody.substring(0, 200) });
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData.data?.markdown || '';

    if (!markdown || markdown.length < 50) {
      return res.status(422).json({ success: false, error: 'ページからコンテンツを取得できませんでした' });
    }

    // Truncate to avoid token limits
    const truncated = markdown.substring(0, 12000);

    // 2. Extract store info with Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `飲食店のウェブページの内容から、以下のJSON形式で店舗情報を抽出してください。
取得できない項目はnullにしてください。JSONのみ返してください。他の説明は不要です。

{
  "store_name": "店舗名",
  "phone": "電話番号",
  "address": "住所",
  "genres": ["ジャンル1", "ジャンル2"],
  "regular_holiday": "定休日",
  "business_hours": "営業時間テキスト（例: 11:00〜14:00 / 17:00〜22:00）",
  "price_range_lunch": "ランチ価格帯（例: ¥1,000~¥1,999）",
  "price_range_dinner": "ディナー価格帯（例: ¥4,000~¥4,999）",
  "website_url": "公式HP URL"
}`,
        messages: [{ role: 'user', content: truncated }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      return res.status(502).json({ success: false, error: 'Claude API error: ' + errBody.substring(0, 200) });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(422).json({ success: false, error: '店舗情報の抽出に失敗しました' });
    }

    const storeInfo = JSON.parse(jsonMatch[0]);

    return res.status(200).json({ success: true, data: storeInfo });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Internal error' });
  }
}
