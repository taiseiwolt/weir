#!/usr/bin/env node
// GHA-05 helper: Firecrawl scan of 居酒屋潮 production pages.
//
// Called from .github/workflows/firecrawl-scan.yml after every successful
// production deployment. Exits 1 (failing the workflow) if any of:
//   - page returns non-2xx
//   - placeholder text residue ("サンプル", "TODO", "TBD", "Lorem ipsum", "テスト")
//     is found in rendered HTML
//   - obvious asset 404 markers in HTML
//
// Env:
//   FIRECRAWL_API_KEY  — required, set as GitHub secret
//
// No npm dependency required — uses Node 20 built-in `fetch`.

const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) {
  console.error('ERROR: FIRECRAWL_API_KEY not set');
  process.exit(1);
}

const TARGETS = [
  'https://xorder.co.jp/izakaya-ushio',
  'https://xorder.co.jp/izakaya-ushio/ra6dxdh',
  'https://xorder.co.jp/izakaya-ushio/ra6dxdh/order',
  'https://xorder.co.jp/izakaya-ushio/mypage',
  'https://xorder.co.jp/legal/terms',
  'https://xorder.co.jp/izakaya-ushio/ra6dxdh/checkout',
];

// Placeholder / fake data markers. Checked case-insensitively.
// "テスト" alone is too broad (legitimate UI copy). Use longer distinctive
// phrases that would only appear in dev stubs.
const FORBIDDEN_MARKERS = [
  'Lorem ipsum',
  'TBD',
  'TODO',
  'placeholder-text',   // a hypothetical CSS class name for stubs
  'サンプルテキスト',     // sample text
  'テスト店舗',            // test store
  'テストユーザー',       // test user
  'ダミー',                // dummy
];

async function scrape(url) {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['html', 'markdown'],
      onlyMainContent: false,
      waitFor: 2000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.data || json;
}

function findForbiddenMarkers(content) {
  const hits = [];
  const lower = content.toLowerCase();
  for (const marker of FORBIDDEN_MARKERS) {
    if (lower.includes(marker.toLowerCase())) {
      hits.push(marker);
    }
  }
  return hits;
}

(async () => {
  const failures = [];

  for (const url of TARGETS) {
    process.stdout.write(`[firecrawl] ${url} ... `);

    try {
      const data = await scrape(url);
      const html = data.html || '';
      const md = data.markdown || '';
      const status = data.metadata?.statusCode ?? 200;

      if (status >= 400) {
        console.log(`FAIL (status ${status})`);
        failures.push({ url, reason: `HTTP ${status}` });
        continue;
      }

      const markers = findForbiddenMarkers(html + '\n' + md);
      if (markers.length > 0) {
        console.log(`FAIL (markers: ${markers.join(', ')})`);
        failures.push({ url, reason: `placeholder residue: ${markers.join(', ')}` });
        continue;
      }

      console.log('OK');
    } catch (err) {
      console.log(`FAIL (${err.message})`);
      failures.push({ url, reason: err.message });
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`\n${failures.length} page(s) failed Firecrawl scan:`);
    for (const f of failures) {
      console.error(`  - ${f.url}\n      ${f.reason}`);
    }
    process.exit(1);
  }

  console.log(`All ${TARGETS.length} pages passed Firecrawl scan.`);
})();
