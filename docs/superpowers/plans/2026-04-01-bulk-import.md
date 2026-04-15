# 管理マスタ一括登録/アップデート機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV/XLSX bulk import with UPSERT logic for corporations, brands, stores, and menu data to both weir-admin.html and weir-customer-admin.html.

**Architecture:** Client parses CSV/XLSX in-browser using the existing XLSX CDN library, then sends JSON to a new Vercel Serverless Function (`api/bulk-import/[...path].js`) which validates, detects new-vs-update via UPSERT keys, and executes DB operations via Supabase service-role client. The existing bulk upload UI in weir-admin.html is extended (not replaced) with DB-backed operations, UPSERT detection, menu support, and "download with existing data" feature. A new "一括登録" tab is added to weir-customer-admin.html.

**Tech Stack:** Vanilla JS + XLSX CDN (client), Vercel Serverless Functions + @supabase/supabase-js (API), PostgreSQL/Supabase (DB)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `api/bulk-import/[...path].js` | Create | API: preview (validate+UPSERT detect), execute (DB write), template download with data |
| `weir-admin.html` | Modify | Extend existing bulk upload: add menu type, UPSERT detection, DB-backed execute, download-with-data, progress UI |
| `weir-customer-admin.html` | Modify | Add "一括登録" tab with bulk import UI for corp/brand/store |
| `vercel.json` | Modify | Add rewrite for `/api/bulk-import` routes |

---

### Task 1: API — Bulk Import Endpoint (Preview + Execute)

**Files:**
- Create: `api/bulk-import/[...path].js`
- Modify: `vercel.json`
- Modify: `package.json` (no new deps needed — client-side parsing only)

- [ ] **Step 1: Create the bulk-import API file with routing skeleton**

Create `api/bulk-import/[...path].js`:

```javascript
import { handleCors, ok, error } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';
import { supabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Route: /api/bulk-import/preview, /api/bulk-import/execute, /api/bulk-import/export
  const segments = (req.query.path || '').split('/').filter(Boolean);
  const action = segments[0]; // preview | execute | export

  if (req.method === 'POST' && action === 'preview') return handlePreview(req, res);
  if (req.method === 'POST' && action === 'execute') return handleExecute(req, res);
  if (req.method === 'GET' && action === 'export') return handleExport(req, res);
  return error(res, 'Not found', 404);
}

// === PREVIEW: Validate rows + detect new vs update ===
async function handlePreview(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { type, rows } = req.body; // type: corporation|brand|store|menu
  if (!type || !rows || !Array.isArray(rows)) {
    return error(res, 'type and rows are required');
  }

  const result = await validateAndDetect(type, rows);
  return ok(res, result);
}

// === EXECUTE: Upsert to DB ===
async function handleExecute(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { type, rows } = req.body;
  if (!type || !rows || !Array.isArray(rows)) {
    return error(res, 'type and rows are required');
  }

  // Re-validate before execute
  const validation = await validateAndDetect(type, rows);
  if (validation.errors.length > 0) {
    return error(res, 'Validation errors exist', 400);
  }

  const result = await executeUpsert(type, validation.items);
  return ok(res, result);
}

// === EXPORT: Download existing data as JSON ===
async function handleExport(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const type = req.query.type;
  if (!type) return error(res, 'type is required');

  const data = await fetchExistingData(type);
  return ok(res, { data });
}

// ======= VALIDATION + UPSERT DETECTION =======

async function validateAndDetect(type, rows) {
  const items = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2
    const row = rows[i];
    try {
      if (type === 'corporation') {
        const item = await validateCorporation(row, rowNum);
        items.push(item);
      } else if (type === 'brand') {
        const item = await validateBrand(row, rowNum);
        items.push(item);
      } else if (type === 'store') {
        const item = await validateStore(row, rowNum);
        items.push(item);
      } else if (type === 'menu_category') {
        const item = await validateCategory(row, rowNum);
        items.push(item);
      } else if (type === 'menu_product') {
        const item = await validateProduct(row, rowNum);
        items.push(item);
      } else if (type === 'menu_size') {
        const item = await validateProductSize(row, rowNum);
        items.push(item);
      } else {
        errors.push({ row: rowNum, message: '不明なデータ種別: ' + type });
      }
    } catch (e) {
      errors.push({ row: rowNum, message: e.message });
    }
  }

  return { items, errors, summary: { total: rows.length, newCount: items.filter(i => i._action === 'insert').length, updateCount: items.filter(i => i._action === 'update').length, errorCount: errors.length } };
}

// --- Corporation ---
async function validateCorporation(row, rowNum) {
  const name = (row.name || '').trim();
  if (!name) throw new Error('法人名が空です');

  // Check if exists by name
  const { data: existing } = await supabase
    .from('corporations').select('id').eq('name', name).maybeSingle();

  return {
    _action: existing ? 'update' : 'insert',
    _existingId: existing?.id || null,
    name,
    representative: (row.representative || '').trim() || null,
    status: (['active', 'trial'].includes(row.status)) ? row.status : 'active',
    website_url: (row.website_url || '').trim() || null,
    recruit_url: (row.recruit_url || '').trim() || null,
  };
}

// --- Brand ---
async function validateBrand(row, rowNum) {
  const name = (row.name || '').trim();
  const slug = (row.slug || '').trim();
  if (!name || !slug) throw new Error('ブランド名またはスラッグが空です');

  // Resolve corp by name
  const corpName = (row.corp_name || '').trim();
  if (!corpName) throw new Error('法人名が空です');
  const { data: corp } = await supabase
    .from('corporations').select('id').eq('name', corpName).maybeSingle();
  if (!corp) throw new Error('法人「' + corpName + '」が見つかりません');

  // Check if exists by slug
  const { data: existing } = await supabase
    .from('brands').select('id').eq('slug', slug).maybeSingle();

  return {
    _action: existing ? 'update' : 'insert',
    _existingId: existing?.id || null,
    corp_id: corp.id,
    name,
    slug,
    tagline: (row.tagline || '').trim() || null,
    main_color: (row.main_color || '').trim() || null,
    logo_emoji: (row.logo_emoji || '').trim() || null,
    font: (row.font || '').trim() || null,
  };
}

// --- Store ---
async function validateStore(row, rowNum) {
  const name = (row.name || '').trim();
  const brandSlug = (row.brand_slug || '').trim();
  if (!name) throw new Error('店舗名が空です');
  if (!brandSlug) throw new Error('ブランドスラッグが空です');

  const { data: brand } = await supabase
    .from('brands').select('id').eq('slug', brandSlug).maybeSingle();
  if (!brand) throw new Error('ブランド「' + brandSlug + '」が見つかりません');

  // Check existing by brand_id + slug (or name as fallback)
  const storeSlug = (row.slug || '').trim();
  let existing = null;
  if (storeSlug) {
    const { data } = await supabase
      .from('stores').select('id').eq('brand_id', brand.id).eq('slug', storeSlug).maybeSingle();
    existing = data;
  }

  return {
    _action: existing ? 'update' : 'insert',
    _existingId: existing?.id || null,
    brand_id: brand.id,
    name,
    slug: storeSlug || null,
    address: (row.address || '').trim() || null,
    phone: (row.phone || '').trim() || null,
    email: (row.email || '').trim() || null,
    genre: (row.genre || '').trim() || null,
    lat: row.lat ? parseFloat(row.lat) : null,
    lng: row.lng ? parseFloat(row.lng) : null,
    has_takeout: row.has_takeout === 'ON' || row.has_takeout === true || null,
    has_delivery: row.has_delivery === 'ON' || row.has_delivery === true || null,
    reservation_enabled: row.reservation_enabled === 'ON' || row.reservation_enabled === true || null,
    min_order_amount: row.min_order_amount ? parseInt(row.min_order_amount) : null,
    prep_time_minutes: row.prep_time_minutes ? parseInt(row.prep_time_minutes) : null,
  };
}

// --- Category ---
async function validateCategory(row, rowNum) {
  const brandSlug = (row.brand_slug || '').trim();
  const name = (row.name || '').trim();
  if (!brandSlug || !name) throw new Error('ブランドスラッグまたはカテゴリ名が空です');

  const { data: brand } = await supabase
    .from('brands').select('id').eq('slug', brandSlug).maybeSingle();
  if (!brand) throw new Error('ブランド「' + brandSlug + '」が見つかりません');

  const { data: existing } = await supabase
    .from('categories').select('id').eq('brand_id', brand.id).eq('name', name).maybeSingle();

  return {
    _action: existing ? 'update' : 'insert',
    _existingId: existing?.id || null,
    brand_id: brand.id,
    name,
    sort_order: row.sort_order ? parseInt(row.sort_order) : null,
  };
}

// --- Product ---
async function validateProduct(row, rowNum) {
  const brandSlug = (row.brand_slug || '').trim();
  const catName = (row.category_name || '').trim();
  const name = (row.name || '').trim();
  if (!brandSlug || !catName || !name) throw new Error('ブランドスラッグ、カテゴリ名、または商品名が空です');

  const { data: brand } = await supabase
    .from('brands').select('id').eq('slug', brandSlug).maybeSingle();
  if (!brand) throw new Error('ブランド「' + brandSlug + '」が見つかりません');

  const { data: category } = await supabase
    .from('categories').select('id').eq('brand_id', brand.id).eq('name', catName).maybeSingle();
  if (!category) throw new Error('カテゴリ「' + catName + '」がブランド「' + brandSlug + '」に見つかりません');

  const { data: existing } = await supabase
    .from('products').select('id').eq('brand_id', brand.id).eq('category_id', category.id).eq('name', name).maybeSingle();

  return {
    _action: existing ? 'update' : 'insert',
    _existingId: existing?.id || null,
    brand_id: brand.id,
    category_id: category.id,
    name,
    description: (row.description || '').trim() || null,
    base_price: row.base_price ? parseInt(row.base_price) : null,
    sort_order: row.sort_order ? parseInt(row.sort_order) : null,
    sale_status: row.sale_status === 'OFF' ? 'hidden' : 'on_sale',
  };
}

// --- Product Size ---
async function validateProductSize(row, rowNum) {
  const brandSlug = (row.brand_slug || '').trim();
  const productName = (row.product_name || '').trim();
  const label = (row.label || '').trim();
  if (!brandSlug || !productName || !label) throw new Error('ブランドスラッグ、商品名、またはサイズラベルが空です');

  const { data: brand } = await supabase
    .from('brands').select('id').eq('slug', brandSlug).maybeSingle();
  if (!brand) throw new Error('ブランド「' + brandSlug + '」が見つかりません');

  const { data: product } = await supabase
    .from('products').select('id').eq('brand_id', brand.id).eq('name', productName).maybeSingle();
  if (!product) throw new Error('商品「' + productName + '」がブランド「' + brandSlug + '」に見つかりません');

  const { data: existing } = await supabase
    .from('product_sizes').select('product_id, name')
    .eq('product_id', product.id).eq('name', label).maybeSingle();

  return {
    _action: existing ? 'update' : 'insert',
    _existingId: existing ? { product_id: product.id, name: label } : null,
    product_id: product.id,
    name: label,
    price: row.price ? parseInt(row.price) : null,
    sort_order: row.sort_order ? parseInt(row.sort_order) : null,
  };
}

// ======= EXECUTE UPSERT =======

async function executeUpsert(type, items) {
  let inserted = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const item of items) {
    const action = item._action;
    const existingId = item._existingId;
    // Remove internal fields
    const data = { ...item };
    delete data._action;
    delete data._existingId;

    // Remove null values (preserve existing data for partial update)
    const cleanData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && v !== undefined && v !== '') {
        cleanData[k] = v;
      }
    }

    try {
      const table = getTableName(type);

      if (action === 'insert') {
        const { error: err } = await supabase.from(table).insert(cleanData);
        if (err) throw err;
        inserted++;
      } else if (action === 'update' && existingId) {
        // Build the match condition
        if (type === 'menu_size') {
          // product_sizes has composite key
          const { error: err } = await supabase.from(table)
            .update(cleanData)
            .eq('product_id', existingId.product_id)
            .eq('name', existingId.name);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from(table)
            .update(cleanData).eq('id', existingId);
          if (err) throw err;
        }
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push({ data: cleanData, message: e.message || String(e) });
    }
  }

  return { inserted, updated, skipped, errors };
}

function getTableName(type) {
  const map = {
    corporation: 'corporations',
    brand: 'brands',
    store: 'stores',
    menu_category: 'categories',
    menu_product: 'products',
    menu_size: 'product_sizes',
  };
  return map[type];
}

// ======= EXPORT EXISTING DATA =======

async function fetchExistingData(type) {
  if (type === 'corporation') {
    const { data } = await supabase.from('corporations')
      .select('name, representative, status, website_url, recruit_url')
      .order('name');
    return data || [];
  }
  if (type === 'brand') {
    const { data } = await supabase.from('brands')
      .select('name, slug, corp_id, tagline, main_color, logo_emoji, font, corporations(name)')
      .order('name');
    return (data || []).map(b => ({
      corp_name: b.corporations?.name || '',
      name: b.name,
      slug: b.slug,
      tagline: b.tagline || '',
      main_color: b.main_color || '',
      logo_emoji: b.logo_emoji || '',
      font: b.font || '',
    }));
  }
  if (type === 'store') {
    const { data } = await supabase.from('stores')
      .select('name, slug, brand_id, address, phone, email, genre, lat, lng, has_takeout, has_delivery, reservation_enabled, min_order_amount, prep_time_minutes, brands(slug)')
      .order('name');
    return (data || []).map(s => ({
      brand_slug: s.brands?.slug || '',
      name: s.name,
      slug: s.slug || '',
      address: s.address || '',
      phone: s.phone || '',
      email: s.email || '',
      genre: s.genre || '',
      lat: s.lat || '',
      lng: s.lng || '',
      has_takeout: s.has_takeout ? 'ON' : 'OFF',
      has_delivery: s.has_delivery ? 'ON' : 'OFF',
      reservation_enabled: s.reservation_enabled ? 'ON' : 'OFF',
      min_order_amount: s.min_order_amount || '',
      prep_time_minutes: s.prep_time_minutes || '',
    }));
  }
  if (type === 'menu_category') {
    const { data } = await supabase.from('categories')
      .select('name, sort_order, brand_id, brands(slug)')
      .order('sort_order');
    return (data || []).map(c => ({
      brand_slug: c.brands?.slug || '',
      name: c.name,
      sort_order: c.sort_order || '',
    }));
  }
  if (type === 'menu_product') {
    const { data } = await supabase.from('products')
      .select('name, description, sort_order, sale_status, brand_id, category_id, brands(slug), categories(name)')
      .order('sort_order');
    return (data || []).map(p => ({
      brand_slug: p.brands?.slug || '',
      category_name: p.categories?.name || '',
      name: p.name,
      description: p.description || '',
      base_price: '',
      sort_order: p.sort_order || '',
      sale_status: p.sale_status === 'on_sale' ? 'ON' : 'OFF',
    }));
  }
  if (type === 'menu_size') {
    const { data } = await supabase.from('product_sizes')
      .select('name, price, sort_order, product_id, products(name, brands(slug))')
      .order('sort_order');
    return (data || []).map(s => ({
      brand_slug: s.products?.brands?.slug || '',
      product_name: s.products?.name || '',
      label: s.name,
      price: s.price || '',
      sort_order: s.sort_order || '',
    }));
  }
  return [];
}
```

- [ ] **Step 2: Add vercel.json rewrites for bulk-import**

Add to the `rewrites` array in `vercel.json`, BEFORE the catch-all rule:

```json
{ "source": "/api/bulk-import/:path*", "destination": "/api/bulk-import/__root?path=:path*" }
```

Wait — the existing API files use `[...path].js` which Vercel handles natively. No rewrite needed for this pattern. Just verify the file at `api/bulk-import/[...path].js` is detected by Vercel's file-based routing.

Actually, looking at vercel.json more carefully, the catch-all `"/((?!api/|legal/).*)"` already excludes `/api/` paths. So `api/bulk-import/[...path].js` should work with Vercel's native routing for `/api/bulk-import/preview`, `/api/bulk-import/execute`, `/api/bulk-import/export?type=...`.

**No changes to vercel.json needed.**

- [ ] **Step 3: Test the API locally**

Run: `npx vercel dev` and test with curl:

```bash
# Test preview
curl -X POST http://localhost:3000/api/bulk-import/preview \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"type":"corporation","rows":[{"name":"テスト法人","representative":"テスト太郎"}]}'

# Test export
curl http://localhost:3000/api/bulk-import/export?type=corporation \
  -H "Authorization: Bearer <token>"
```

Expected: JSON response with validation results / existing data.

- [ ] **Step 4: Commit**

```bash
git add api/bulk-import/
git commit -m "feat: add bulk-import API endpoint with preview, execute, and export"
```

---

### Task 2: weir-admin.html — Extend Bulk Upload with DB-backed UPSERT

**Files:**
- Modify: `weir-admin.html` (lines ~1363-1526: TEMPLATES, downloadTemplate, bulk upload functions)

This task extends the existing bulk upload infrastructure to:
1. Add menu type to templates
2. Add "download with existing data" button
3. Change `confirmBulkImport()` to call the API instead of pushing to in-memory arrays
4. Add UPSERT detection (new vs update badges) in preview
5. Add progress bar and result summary
6. Add "一括登録" nav item in sidebar for dedicated bulk import page

- [ ] **Step 1: Add sidebar nav item for dedicated bulk import**

Find the sidebar nav items (line ~97, after CS管理) and add:

```html
<div class="nav-item" data-page="bulk" onclick="goTo('bulk')"><span class="icon">📥</span><span class="label">データ一括管理</span></div>
```

- [ ] **Step 2: Add the bulk import page render function**

Add a new `renderBulkPage()` function in the render section. This provides a dedicated page for all bulk operations with data type selector and the 4-step flow:

```javascript
function renderBulkPage(){
  return '<div class="page-title">データ一括管理</div><div class="page-subtitle">CSV/XLSXによる一括登録・一括更新</div>'+
  '<div class="card"><div class="card-title">📥 一括登録 / 更新</div>'+
  // Step 1: Type selection
  '<div style="margin-bottom:20px">'+
  '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">データ種別を選択</label>'+
  '<select id="bulkTypeSelect" class="sinput" style="width:auto" onchange="onBulkTypeChange()">'+
  '<option value="">-- 選択してください --</option>'+
  '<option value="corporation">法人</option>'+
  '<option value="brand">ブランド</option>'+
  '<option value="store">店舗</option>'+
  '<option value="menu_category">メニューカテゴリ</option>'+
  '<option value="menu_product">メニュー商品</option>'+
  '<option value="menu_size">商品サイズ</option>'+
  '</select></div>'+
  // Template download buttons
  '<div id="bulkTemplateArea" style="display:none;margin-bottom:20px">'+
  '<div class="btn-group">'+
  '<button class="btn btn-s" onclick="downloadBulkTemplate(false)">📋 空テンプレートをダウンロード</button>'+
  '<button class="btn btn-s" onclick="downloadBulkTemplate(true)">📋 既存データ付きでダウンロード</button>'+
  '</div></div>'+
  // Upload area
  '<div id="bulkUploadArea" style="display:none">'+
  '<div class="upload-zone" id="bulkDropZone2" onclick="document.getElementById(\'bulkFileInput2\').click()" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="event.preventDefault();this.classList.remove(\'drag\');handleBulkFile(event.dataTransfer.files[0])">'+
  '<div class="uz-icon">📎</div><p>クリックまたはドラッグ&ドロップ<br><span style="font-size:10px">CSV (.csv) / Excel (.xlsx)</span></p></div>'+
  '<input type="file" id="bulkFileInput2" accept=".csv,.xlsx,.xls" style="display:none" onchange="handleBulkFile(this.files[0])">'+
  '</div>'+
  // Preview area
  '<div id="bulkPreviewArea"></div>'+
  // Progress bar
  '<div id="bulkProgressArea" style="display:none;margin:16px 0">'+
  '<div style="font-size:12px;font-weight:600;margin-bottom:6px" id="bulkProgressLabel">処理中...</div>'+
  '<div style="background:#f0f0f0;border-radius:4px;height:22px;overflow:hidden"><div id="bulkProgressBar" style="height:100%;background:var(--accent);border-radius:4px;width:0%;transition:width .3s"></div></div></div>'+
  // Result area
  '<div id="bulkResultArea"></div>'+
  '</div>';
}
```

- [ ] **Step 3: Register the page in the goTo function**

In the `goTo()` / `renderPage()` function, add the `bulk` page case so it renders `renderBulkPage()`.

- [ ] **Step 4: Add bulk template definitions for all 6 types**

Replace/extend the existing `TEMPLATES` object and add `BULK_TEMPLATES`:

```javascript
const BULK_TEMPLATES = {
  corporation: {
    filename: 'aiden_corp_template.csv',
    format: 'csv',
    headers: ['法人名*', '代表者*', 'ステータス(active/trial)', '会社HP URL', '採用ページURL'],
    keys: ['name', 'representative', 'status', 'website_url', 'recruit_url'],
    sample: [['株式会社サンプル', '山田太郎', 'active', 'https://example.co.jp', 'https://example.co.jp/recruit']],
  },
  brand: {
    filename: 'aiden_brand_template.csv',
    format: 'csv',
    headers: ['法人名*', 'ブランド名*', 'スラッグ*', 'キャッチコピー', 'メインカラー(hex)', 'ロゴ絵文字', 'フォント'],
    keys: ['corp_name', 'name', 'slug', 'tagline', 'main_color', 'logo_emoji', 'font'],
    sample: [['株式会社サンプル', '焼肉サンプル', 'sample-yakiniku', '最高の一品', '#DC3232', '🥩', 'Noto Sans JP']],
  },
  store: {
    filename: 'aiden_store_template.xlsx',
    format: 'xlsx',
    headers: ['ブランドスラッグ*', '店舗名*', 'スラッグ', '住所', '電話番号', 'メール', 'ジャンル', '緯度', '経度', 'テイクアウト(ON/OFF)', 'デリバリー(ON/OFF)', '席予約(ON/OFF)', '最低注文金額', '準備時間(分)'],
    keys: ['brand_slug', 'name', 'slug', 'address', 'phone', 'email', 'genre', 'lat', 'lng', 'has_takeout', 'has_delivery', 'reservation_enabled', 'min_order_amount', 'prep_time_minutes'],
    sample: [['sumibite', '渋谷店', 'shibuya', '東京都渋谷区道玄坂1-12-5', '03-6452-1234', 'shibuya@example.com', '焼肉', '35.6595', '139.7005', 'ON', 'OFF', 'ON', '1500', '30']],
  },
  menu_category: {
    filename: 'aiden_menu_category_template.xlsx',
    format: 'xlsx',
    headers: ['ブランドスラッグ*', 'カテゴリ名*', '表示順'],
    keys: ['brand_slug', 'name', 'sort_order'],
    sample: [['sumibite', '焼肉', '1']],
  },
  menu_product: {
    filename: 'aiden_menu_product_template.xlsx',
    format: 'xlsx',
    headers: ['ブランドスラッグ*', 'カテゴリ名*', '商品名*', '説明', '基本価格', '表示順', '利用可能(ON/OFF)'],
    keys: ['brand_slug', 'category_name', 'name', 'description', 'base_price', 'sort_order', 'sale_status'],
    sample: [['sumibite', '焼肉', '特選カルビ', '厳選A5ランク黒毛和牛', '1280', '1', 'ON']],
  },
  menu_size: {
    filename: 'aiden_menu_size_template.xlsx',
    format: 'xlsx',
    headers: ['ブランドスラッグ*', '商品名*', 'サイズラベル*', '価格*', '表示順'],
    keys: ['brand_slug', 'product_name', 'label', 'price', 'sort_order'],
    sample: [['sumibite', '特選カルビ', '150g', '1280', '1']],
  },
};
```

- [ ] **Step 5: Add template download functions**

```javascript
function onBulkTypeChange() {
  const type = document.getElementById('bulkTypeSelect').value;
  document.getElementById('bulkTemplateArea').style.display = type ? 'block' : 'none';
  document.getElementById('bulkUploadArea').style.display = type ? 'block' : 'none';
  document.getElementById('bulkPreviewArea').innerHTML = '';
  document.getElementById('bulkResultArea').innerHTML = '';
  document.getElementById('bulkProgressArea').style.display = 'none';
}

function downloadBulkTemplate(includeData) {
  const type = document.getElementById('bulkTypeSelect').value;
  const tmpl = BULK_TEMPLATES[type];
  if (!tmpl) return;

  if (includeData) {
    downloadTemplateWithData(type, tmpl);
    return;
  }

  // Empty template
  if (tmpl.format === 'csv') {
    const bom = '\uFEFF';
    const csv = bom + tmpl.headers.join(',') + '\n' + tmpl.sample.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = tmpl.filename; a.click();
  } else {
    // XLSX
    const wb = XLSX.utils.book_new();
    const wsData = [tmpl.headers, ...tmpl.sample];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'データ');
    XLSX.writeFile(wb, tmpl.filename);
  }
  showToast('📋 テンプレートをダウンロードしました');
}

async function downloadTemplateWithData(type, tmpl) {
  showToast('⏳ 既存データを取得中...');
  try {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    const resp = await fetch('/api/bulk-import/export?type=' + type, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const json = await resp.json();
    if (!resp.ok) { showToast('❌ ' + (json.error || 'エラー')); return; }

    const rows = (json.data || []).map(item => tmpl.keys.map(k => item[k] || ''));

    if (tmpl.format === 'csv') {
      const bom = '\uFEFF';
      const csv = bom + tmpl.headers.join(',') + '\n' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = tmpl.filename.replace('.csv', '_data.csv'); a.click();
    } else {
      const wb = XLSX.utils.book_new();
      const wsData = [tmpl.headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'データ');
      XLSX.writeFile(wb, tmpl.filename.replace('.xlsx', '_data.xlsx'));
    }
    showToast('📋 既存データ付きテンプレートをダウンロードしました');
  } catch (e) {
    showToast('❌ ダウンロード失敗: ' + e.message);
  }
}
```

- [ ] **Step 6: Add file handling and API-backed preview**

```javascript
function handleBulkFile(file) {
  if (!file) return;
  const type = document.getElementById('bulkTypeSelect').value;
  if (!type) { showToast('⚠️ データ種別を選択してください'); return; }

  const ext = file.name.split('.').pop().toLowerCase();
  const pv = document.getElementById('bulkPreviewArea');
  pv.innerHTML = '<div class="upload-result" style="background:#f5f6fa;color:var(--text)">⏳ 読み込み中...</div>';
  document.getElementById('bulkResultArea').innerHTML = '';
  document.getElementById('bulkProgressArea').style.display = 'none';

  const tmpl = BULK_TEMPLATES[type];
  if (!tmpl) return;

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = function(e) { parsedToPreview(type, tmpl, parseCSVRows(e.target.result)); };
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        parsedToPreview(type, tmpl, XLSX.utils.sheet_to_json(ws, { header: 1 }));
      } catch (err) {
        pv.innerHTML = '<div class="upload-result err">❌ Excel読み込み失敗: ' + esc(err.message) + '</div>';
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    pv.innerHTML = '<div class="upload-result err">❌ CSV または XLSX ファイルを選択してください</div>';
  }
}

function parseCSVRows(text) {
  const lines = text.split('\n').map(l => l.replace(/^\uFEFF/, ''));
  return lines.map(line => {
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += line[i]; }
    }
    result.push(current.trim());
    return result;
  }).filter(r => r.some(c => c));
}

async function parsedToPreview(type, tmpl, rawRows) {
  const pv = document.getElementById('bulkPreviewArea');
  if (rawRows.length < 2) { pv.innerHTML = '<div class="upload-result err">❌ データ行がありません</div>'; return; }

  const dataRows = rawRows.slice(1).filter(r => r.some(c => c && String(c).trim()));
  if (!dataRows.length) { pv.innerHTML = '<div class="upload-result err">❌ データ行がありません</div>'; return; }

  // Convert array rows to objects using template keys
  const objects = dataRows.map(row => {
    const obj = {};
    tmpl.keys.forEach((key, idx) => { obj[key] = String(row[idx] || '').trim(); });
    return obj;
  });

  // Call API for preview (validation + UPSERT detection)
  pv.innerHTML = '<div class="upload-result" style="background:#f5f6fa;color:var(--text)">⏳ バリデーション中...</div>';

  try {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    const resp = await fetch('/api/bulk-import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ type, rows: objects }),
    });
    const json = await resp.json();
    if (!resp.ok) { pv.innerHTML = '<div class="upload-result err">❌ ' + esc(json.error || 'エラー') + '</div>'; return; }

    renderBulkPreviewResult(type, tmpl, json, objects);
  } catch (e) {
    pv.innerHTML = '<div class="upload-result err">❌ API通信エラー: ' + esc(e.message) + '</div>';
  }
}
```

- [ ] **Step 7: Add preview rendering with new/update badges**

```javascript
function renderBulkPreviewResult(type, tmpl, result, objects) {
  const pv = document.getElementById('bulkPreviewArea');
  const { items, errors, summary } = result;

  let h = '<div style="font-size:12px;font-weight:700;margin:16px 0 8px">📋 プレビュー（' + summary.total + '件）</div>';

  // Summary badges
  h += '<div style="display:flex;gap:12px;margin-bottom:12px">';
  h += '<span style="background:#e6f9f0;color:#00b894;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">🆕 新規 ' + summary.newCount + '件</span>';
  h += '<span style="background:#dfe6e9;color:#0984e3;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">🔄 更新 ' + summary.updateCount + '件</span>';
  if (summary.errorCount > 0) {
    h += '<span style="background:#fab1a0;color:#d63031;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">❌ エラー ' + summary.errorCount + '件</span>';
  }
  h += '</div>';

  // Errors
  if (errors.length) {
    h += '<div class="upload-result err" style="margin-bottom:12px">⚠️ エラー詳細:<br>' + errors.map(e => '・行' + e.row + ': ' + esc(e.message)).join('<br>') + '</div>';
  }

  // Preview table
  if (items.length) {
    const displayKeys = tmpl.keys.slice(0, 5);
    const displayHeaders = tmpl.headers.slice(0, 5);
    h += '<div style="overflow-x:auto;max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:8px"><table class="data-table" style="font-size:11px"><thead><tr><th>#</th>' + displayHeaders.map(c => '<th>' + esc(c.replace(/\*/g, '')) + '</th>').join('') + '<th>状態</th></tr></thead><tbody>';
    items.forEach((item, i) => {
      const actionBadge = item._action === 'insert'
        ? '<span style="background:#e6f9f0;color:#00b894;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">🆕 新規</span>'
        : '<span style="background:#dfe6e9;color:#0984e3;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">🔄 更新</span>';
      h += '<tr><td>' + (i + 1) + '</td>' + displayKeys.map(k => '<td>' + esc(item[k] || objects[i]?.[k] || '—') + '</td>').join('') + '<td>' + actionBadge + '</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  // Action buttons (only if no errors)
  if (errors.length === 0 && items.length > 0) {
    h += '<div class="btn-group" style="margin-top:16px"><button class="btn btn-p" onclick="executeBulkImport()">✅ 一括登録/更新を実行（' + items.length + '件）</button></div>';
    // Store for execution
    window._bulkExecuteData = { type, rows: objects };
  }

  pv.innerHTML = h;
}
```

- [ ] **Step 8: Add execute function with progress bar**

```javascript
async function executeBulkImport() {
  if (!window._bulkExecuteData) return;
  const { type, rows } = window._bulkExecuteData;

  const progressArea = document.getElementById('bulkProgressArea');
  const progressBar = document.getElementById('bulkProgressBar');
  const progressLabel = document.getElementById('bulkProgressLabel');
  const resultArea = document.getElementById('bulkResultArea');

  progressArea.style.display = 'block';
  progressBar.style.width = '30%';
  progressLabel.textContent = '⏳ データベースに書き込み中...';

  try {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    progressBar.style.width = '60%';

    const resp = await fetch('/api/bulk-import/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ type, rows }),
    });
    progressBar.style.width = '90%';

    const json = await resp.json();
    progressBar.style.width = '100%';
    progressLabel.textContent = '✅ 完了';

    if (!resp.ok) {
      resultArea.innerHTML = '<div class="upload-result err">❌ ' + esc(json.error || 'エラー') + '</div>';
      return;
    }

    // Show result summary
    let h = '<div class="upload-result ok" style="margin-top:12px">✅ 処理完了</div>';
    h += '<div style="display:flex;gap:12px;margin-top:12px">';
    h += '<span style="background:#e6f9f0;color:#00b894;padding:6px 16px;border-radius:8px;font-weight:700">🆕 新規登録 ' + json.inserted + '件</span>';
    h += '<span style="background:#dfe6e9;color:#0984e3;padding:6px 16px;border-radius:8px;font-weight:700">🔄 更新 ' + json.updated + '件</span>';
    if (json.skipped > 0) h += '<span style="background:#fff3e0;color:#e17055;padding:6px 16px;border-radius:8px;font-weight:700">⏭ スキップ ' + json.skipped + '件</span>';
    h += '</div>';

    if (json.errors && json.errors.length > 0) {
      h += '<div class="upload-result err" style="margin-top:12px">⚠️ 一部エラー:<br>' + json.errors.map(e => '・' + esc(e.message)).join('<br>') + '</div>';
      // Error rows CSV download
      h += '<button class="btn btn-s" style="margin-top:8px" onclick="downloadErrorRows()">📥 エラー行をCSVダウンロード</button>';
      window._bulkErrors = json.errors;
    }

    resultArea.innerHTML = h;
    window._bulkExecuteData = null;

  } catch (e) {
    progressLabel.textContent = '❌ エラー';
    resultArea.innerHTML = '<div class="upload-result err">❌ ' + esc(e.message) + '</div>';
  }
}

function downloadErrorRows() {
  if (!window._bulkErrors) return;
  const bom = '\uFEFF';
  const csv = bom + 'エラー内容,データ\n' + window._bulkErrors.map(e =>
    '"' + String(e.message).replace(/"/g, '""') + '","' + JSON.stringify(e.data || {}).replace(/"/g, '""') + '"'
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bulk_import_errors.csv'; a.click();
}
```

- [ ] **Step 9: Update existing corp/brand/store list pages to add bulk buttons**

In the existing `renderCorpsList()`, `renderBrandsList()`, `renderStoresList()` functions, add buttons that link to the bulk page:

For each list page, add to the toolbar area:
```javascript
'<button class="btn-outline btn-sm" onclick="goTo(\'bulk\');setTimeout(()=>{document.getElementById(\'bulkTypeSelect\').value=\'corporation\';onBulkTypeChange();},100)">📥 一括登録/更新</button>'
```

(With the appropriate type value for each: `corporation`, `brand`, `store`)

- [ ] **Step 10: Commit**

```bash
git add weir-admin.html
git commit -m "feat: extend admin bulk upload with DB-backed UPSERT, menu support, and download-with-data"
```

---

### Task 3: weir-customer-admin.html — Add Bulk Import Tab

**Files:**
- Modify: `weir-customer-admin.html`

This task adds a "一括登録" tab to the customer admin page for corp/brand/store bulk operations.

- [ ] **Step 1: Identify the sidebar navigation structure**

Read the sidebar/nav area of weir-customer-admin.html to find where to add the new page section link. The file uses a sidebar navigation with `page-*` sections.

- [ ] **Step 2: Add navigation item**

Add a new nav item in the sidebar for "一括登録":

```html
<div class="sidebar-item" data-page="page-bulk-import" onclick="showPage('page-bulk-import')">
  <span class="sidebar-icon">📥</span>
  <span>一括登録</span>
</div>
```

(Match the exact sidebar pattern used by the existing nav items.)

- [ ] **Step 3: Add the bulk import page section**

Add a new `<div class="page" id="page-bulk-import">` section with the same 4-step UI as admin:

```html
<div class="page" id="page-bulk-import">
  <div class="page-header-bar">
    <h2 class="page-title-text">一括登録 / 更新</h2>
    <p class="page-subtitle-text">CSV/XLSXによる一括登録・一括更新</p>
  </div>
  <div class="card">
    <div class="card-title">📥 一括登録 / 更新</div>
    <div style="margin-bottom:20px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">データ種別を選択</label>
      <select id="caBulkTypeSelect" class="input-field" style="width:auto" onchange="onCaBulkTypeChange()">
        <option value="">-- 選択してください --</option>
        <option value="corporation">法人</option>
        <option value="brand">ブランド</option>
        <option value="store">店舗</option>
      </select>
    </div>
    <div id="caBulkTemplateArea" style="display:none;margin-bottom:20px">
      <div class="btn-group">
        <button class="btn btn-secondary" onclick="caBulkDownloadTemplate(false)">📋 空テンプレートをダウンロード</button>
        <button class="btn btn-secondary" onclick="caBulkDownloadTemplate(true)">📋 既存データ付きでダウンロード</button>
      </div>
    </div>
    <div id="caBulkUploadArea" style="display:none">
      <div class="bulk-upload-area" id="caBulkDrop" onclick="document.getElementById('caBulkFileInput').click()" ondragover="event.preventDefault();this.style.borderColor='var(--accent)'" ondragleave="this.style.borderColor=''" ondrop="event.preventDefault();this.style.borderColor='';caBulkHandleFile(event.dataTransfer.files[0])">
        <div class="icon">📎</div>
        <p>クリックまたはドラッグ&ドロップ<br><span style="font-size:10px">CSV (.csv) / Excel (.xlsx)</span></p>
      </div>
      <input type="file" id="caBulkFileInput" accept=".csv,.xlsx,.xls" style="display:none" onchange="caBulkHandleFile(this.files[0])">
    </div>
    <div id="caBulkPreview"></div>
    <div id="caBulkProgress" style="display:none;margin:16px 0">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px" id="caBulkProgressLabel">処理中...</div>
      <div style="background:#f0f0f0;border-radius:4px;height:22px;overflow:hidden"><div id="caBulkProgressBar" style="height:100%;background:var(--accent);border-radius:4px;width:0%;transition:width .3s"></div></div>
    </div>
    <div id="caBulkResult"></div>
  </div>
</div>
```

- [ ] **Step 4: Add the JavaScript functions for customer-admin bulk import**

The customer-admin version reuses the same BULK_TEMPLATES definition and API calls. Add the following JavaScript (adapting element IDs to use `ca` prefix to avoid conflicts):

```javascript
// BULK IMPORT (Customer Admin)
const CA_BULK_TEMPLATES = {
  corporation: {
    filename: 'aiden_corp_template.csv', format: 'csv',
    headers: ['法人名*','代表者*','ステータス(active/trial)','会社HP URL','採用ページURL'],
    keys: ['name','representative','status','website_url','recruit_url'],
    sample: [['株式会社サンプル','山田太郎','active','https://example.co.jp','https://example.co.jp/recruit']],
  },
  brand: {
    filename: 'aiden_brand_template.csv', format: 'csv',
    headers: ['法人名*','ブランド名*','スラッグ*','キャッチコピー','メインカラー(hex)','ロゴ絵文字','フォント'],
    keys: ['corp_name','name','slug','tagline','main_color','logo_emoji','font'],
    sample: [['株式会社サンプル','焼肉サンプル','sample-yakiniku','最高の一品','#DC3232','🥩','Noto Sans JP']],
  },
  store: {
    filename: 'aiden_store_template.xlsx', format: 'xlsx',
    headers: ['ブランドスラッグ*','店舗名*','スラッグ','住所','電話番号','メール','ジャンル','緯度','経度','テイクアウト(ON/OFF)','デリバリー(ON/OFF)','席予約(ON/OFF)','最低注文金額','準備時間(分)'],
    keys: ['brand_slug','name','slug','address','phone','email','genre','lat','lng','has_takeout','has_delivery','reservation_enabled','min_order_amount','prep_time_minutes'],
    sample: [['sumibite','渋谷店','shibuya','東京都渋谷区道玄坂1-12-5','03-6452-1234','shibuya@example.com','焼肉','35.6595','139.7005','ON','OFF','ON','1500','30']],
  },
};

function onCaBulkTypeChange() {
  const type = document.getElementById('caBulkTypeSelect').value;
  document.getElementById('caBulkTemplateArea').style.display = type ? 'block' : 'none';
  document.getElementById('caBulkUploadArea').style.display = type ? 'block' : 'none';
  document.getElementById('caBulkPreview').innerHTML = '';
  document.getElementById('caBulkResult').innerHTML = '';
  document.getElementById('caBulkProgress').style.display = 'none';
}

function caBulkDownloadTemplate(includeData) {
  const type = document.getElementById('caBulkTypeSelect').value;
  const tmpl = CA_BULK_TEMPLATES[type];
  if (!tmpl) return;
  // Same logic as admin downloadBulkTemplate — generate CSV or XLSX
  if (includeData) {
    caBulkDownloadWithData(type, tmpl);
    return;
  }
  if (tmpl.format === 'csv') {
    const bom = '\uFEFF';
    const csv = bom + tmpl.headers.join(',') + '\n' + tmpl.sample.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = tmpl.filename; a.click();
  } else {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([tmpl.headers, ...tmpl.sample]);
    XLSX.utils.book_append_sheet(wb, ws, 'データ');
    XLSX.writeFile(wb, tmpl.filename);
  }
  showToast('📋 テンプレートをダウンロードしました');
}

async function caBulkDownloadWithData(type, tmpl) {
  showToast('⏳ 既存データを取得中...');
  try {
    const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
    const resp = await fetch('/api/bulk-import/export?type=' + type, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const json = await resp.json();
    if (!resp.ok) { showToast('❌ ' + (json.error || 'エラー')); return; }
    const rows = (json.data || []).map(item => tmpl.keys.map(k => item[k] || ''));
    if (tmpl.format === 'csv') {
      const bom = '\uFEFF';
      const csv = bom + tmpl.headers.join(',') + '\n' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = tmpl.filename.replace('.csv','_data.csv'); a.click();
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([tmpl.headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, 'データ');
      XLSX.writeFile(wb, tmpl.filename.replace('.xlsx','_data.xlsx'));
    }
    showToast('📋 既存データ付きテンプレートをダウンロードしました');
  } catch (e) { showToast('❌ ' + e.message); }
}

// File handling, preview, execute — same pattern as admin, using caBulk* element IDs
function caBulkHandleFile(file) {
  if (!file) return;
  const type = document.getElementById('caBulkTypeSelect').value;
  if (!type) { showToast('⚠️ データ種別を選択してください'); return; }
  const ext = file.name.split('.').pop().toLowerCase();
  const pv = document.getElementById('caBulkPreview');
  pv.innerHTML = '<div style="background:#f5f6fa;padding:12px;border-radius:8px;font-size:12px">⏳ 読み込み中...</div>';
  const tmpl = CA_BULK_TEMPLATES[type];
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = function(e) { caBulkParsedToPreview(type, tmpl, caBulkParseCSV(e.target.result)); };
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = function(e) {
      try { const wb = XLSX.read(e.target.result, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; caBulkParsedToPreview(type, tmpl, XLSX.utils.sheet_to_json(ws, { header: 1 })); }
      catch (err) { pv.innerHTML = '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px">❌ Excel読み込み失敗: ' + escH(err.message) + '</div>'; }
    };
    reader.readAsArrayBuffer(file);
  }
}

function caBulkParseCSV(text) {
  const lines = text.split('\n').map(l => l.replace(/^\uFEFF/, ''));
  return lines.map(line => {
    const result = []; let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += line[i]; }
    }
    result.push(current.trim());
    return result;
  }).filter(r => r.some(c => c));
}

async function caBulkParsedToPreview(type, tmpl, rawRows) {
  const pv = document.getElementById('caBulkPreview');
  if (rawRows.length < 2) { pv.innerHTML = '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px">❌ データ行がありません</div>'; return; }
  const dataRows = rawRows.slice(1).filter(r => r.some(c => c && String(c).trim()));
  if (!dataRows.length) { pv.innerHTML = '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px">❌ データ行がありません</div>'; return; }
  const objects = dataRows.map(row => { const obj = {}; tmpl.keys.forEach((key, idx) => { obj[key] = String(row[idx] || '').trim(); }); return obj; });
  pv.innerHTML = '<div style="background:#f5f6fa;padding:12px;border-radius:8px;font-size:12px">⏳ バリデーション中...</div>';
  try {
    const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
    const resp = await fetch('/api/bulk-import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ type, rows: objects }),
    });
    const json = await resp.json();
    if (!resp.ok) { pv.innerHTML = '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px">❌ ' + escH(json.error || 'エラー') + '</div>'; return; }
    caBulkRenderPreview(type, tmpl, json, objects);
  } catch (e) { pv.innerHTML = '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px">❌ ' + escH(e.message) + '</div>'; }
}

function caBulkRenderPreview(type, tmpl, result, objects) {
  const pv = document.getElementById('caBulkPreview');
  const { items, errors, summary } = result;
  let h = '<div style="font-size:12px;font-weight:700;margin:16px 0 8px">📋 プレビュー（' + summary.total + '件）</div>';
  h += '<div style="display:flex;gap:12px;margin-bottom:12px">';
  h += '<span style="background:#e6f9f0;color:#00b894;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">🆕 新規 ' + summary.newCount + '件</span>';
  h += '<span style="background:#dfe6e9;color:#0984e3;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">🔄 更新 ' + summary.updateCount + '件</span>';
  if (summary.errorCount > 0) h += '<span style="background:#fab1a0;color:#d63031;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">❌ エラー ' + summary.errorCount + '件</span>';
  h += '</div>';
  if (errors.length) h += '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px;margin-bottom:12px">⚠️ エラー:<br>' + errors.map(e => '・行' + e.row + ': ' + escH(e.message)).join('<br>') + '</div>';
  if (items.length) {
    const dk = tmpl.keys.slice(0, 4); const dh = tmpl.headers.slice(0, 4);
    h += '<div style="overflow-x:auto;max-height:300px;overflow-y:auto;border:1px solid #ddd;border-radius:8px"><table class="data-table" style="font-size:11px"><thead><tr><th>#</th>' + dh.map(c => '<th>' + escH(c.replace(/\*/g,'')) + '</th>').join('') + '<th>状態</th></tr></thead><tbody>';
    items.forEach((item, i) => {
      const badge = item._action === 'insert'
        ? '<span style="background:#e6f9f0;color:#00b894;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">🆕</span>'
        : '<span style="background:#dfe6e9;color:#0984e3;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">🔄</span>';
      h += '<tr><td>' + (i+1) + '</td>' + dk.map(k => '<td>' + escH(item[k]||objects[i]?.[k]||'—') + '</td>').join('') + '<td>' + badge + '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  if (errors.length === 0 && items.length > 0) {
    h += '<div style="margin-top:16px"><button class="btn btn-primary" onclick="caBulkExecute()">✅ 一括登録/更新を実行（' + items.length + '件）</button></div>';
    window._caBulkData = { type, rows: objects };
  }
  pv.innerHTML = h;
}

async function caBulkExecute() {
  if (!window._caBulkData) return;
  const { type, rows } = window._caBulkData;
  const prog = document.getElementById('caBulkProgress');
  const bar = document.getElementById('caBulkProgressBar');
  const label = document.getElementById('caBulkProgressLabel');
  const res = document.getElementById('caBulkResult');
  prog.style.display = 'block'; bar.style.width = '30%'; label.textContent = '⏳ 書き込み中...';
  try {
    const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
    bar.style.width = '60%';
    const resp = await fetch('/api/bulk-import/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ type, rows }),
    });
    bar.style.width = '100%'; label.textContent = '✅ 完了';
    const json = await resp.json();
    let h = '<div style="background:#e6f9f0;color:#00b894;padding:12px;border-radius:8px;font-size:12px;font-weight:700;margin-top:12px">✅ 処理完了</div>';
    h += '<div style="display:flex;gap:12px;margin-top:8px">';
    h += '<span style="background:#e6f9f0;color:#00b894;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">新規 ' + (json.inserted||0) + '件</span>';
    h += '<span style="background:#dfe6e9;color:#0984e3;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700">更新 ' + (json.updated||0) + '件</span>';
    h += '</div>';
    if (json.errors?.length) h += '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px;margin-top:8px">⚠️ 一部エラー:<br>' + json.errors.map(e => '・' + escH(e.message)).join('<br>') + '</div>';
    res.innerHTML = h;
    window._caBulkData = null;
  } catch (e) { label.textContent = '❌ エラー'; res.innerHTML = '<div style="background:#fab1a0;color:#d63031;padding:12px;border-radius:8px;font-size:12px">❌ ' + escH(e.message) + '</div>'; }
}
```

- [ ] **Step 5: Verify XLSX CDN is loaded in customer-admin**

Check if `<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>` is in the `<head>`. If not, add it.

- [ ] **Step 6: Commit**

```bash
git add weir-customer-admin.html
git commit -m "feat: add bulk import tab to customer admin with corp/brand/store support"
```

---

### Task 4: Lint, Self-Review, and Final Commit

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: `✅ No console.log found`

If `console.log` is found, remove it and re-run.

- [ ] **Step 2: Self-review checklist**

- Verify `escH()` / `esc()` is used for all user-supplied data rendered in innerHTML
- Verify no hardcoded API keys in new code
- Verify API requires authentication for all endpoints
- Verify empty cells are treated as "no change" (null values filtered out before update)
- Verify no delete operations exist (spec says delete is excluded)

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: lint and security review for bulk import feature"
```

---

## Spec Coverage Verification

| Requirement | Task |
|---|---|
| テンプレートダウンロード (4種別 x 空+データ付き = 8パターン) | Task 2 Step 5 (admin) + Task 3 Step 4 (customer-admin) — actually 6 types x 2 = 12 patterns for admin, 3 types x 2 = 6 for customer-admin |
| CSV → プレビュー → 実行で法人一括登録 | Task 1 (API corporation) + Task 2 (UI) |
| CSV → プレビュー → 実行でブランド一括登録 | Task 1 (API brand) + Task 2 (UI) |
| XLSX → プレビュー → 実行で店舗一括登録 | Task 1 (API store) + Task 2 (UI) |
| XLSX → プレビュー → 実行でメニュー一括登録 | Task 1 (API menu_category/product/size) + Task 2 (UI) |
| 既存データのUPSERT | Task 1 (validateAndDetect + executeUpsert) |
| 空セルが「変更なし」 | Task 1 (cleanData filters nulls in executeUpsert) |
| エラー行がプレビューでハイライト | Task 2 Step 7 (renderBulkPreviewResult) |
| weir-customer-admin.html にUI配置 | Task 3 |
| weir-admin.html にUI配置 | Task 2 |
