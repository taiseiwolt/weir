import { handleCors, ok, error } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';
import { supabase } from '../_lib/supabase.js';

// ---------------------------------------------------------------------------
// Supported entity types and their configuration
// ---------------------------------------------------------------------------
const TYPE_CONFIG = {
  corporation: {
    table: 'corporations',
    requiredFields: ['name'],
    upsertLookup: lookupCorporation,
    resolveRefs: noopResolve,
    exportQuery: exportCorporations,
  },
  brand: {
    table: 'brands',
    requiredFields: ['name', 'slug', 'corp_name'],
    upsertLookup: lookupBrand,
    resolveRefs: resolveBrandRefs,
    exportQuery: exportBrands,
  },
  store: {
    table: 'stores',
    requiredFields: ['name', 'brand_slug'],
    upsertLookup: lookupStore,
    resolveRefs: resolveStoreRefs,
    exportQuery: exportStores,
  },
  menu_category: {
    table: 'categories',
    requiredFields: ['brand_slug', 'name'],
    upsertLookup: lookupCategory,
    resolveRefs: resolveCategoryRefs,
    exportQuery: exportCategories,
  },
  menu_product: {
    table: 'products',
    requiredFields: ['brand_slug', 'category_name', 'name'],
    upsertLookup: lookupProduct,
    resolveRefs: resolveProductRefs,
    exportQuery: exportProducts,
  },
  menu_size: {
    table: 'product_sizes',
    requiredFields: ['brand_slug', 'product_name', 'label', 'price'],
    upsertLookup: lookupSize,
    resolveRefs: resolveSizeRefs,
    exportQuery: exportSizes,
  },
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rawPath = req.query.path || '';
  const segments = (Array.isArray(rawPath) ? rawPath.join('/') : rawPath)
    .split('/')
    .filter(Boolean);

  const route = segments[0];

  if (route === 'preview' && req.method === 'POST') {
    return handlePreview(req, res);
  }
  if (route === 'execute' && req.method === 'POST') {
    return handleExecute(req, res);
  }
  if (route === 'export' && req.method === 'GET') {
    return handleExport(req, res);
  }

  return error(res, 'Not found', 404);
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/preview
// ---------------------------------------------------------------------------
async function handlePreview(req, res) {
  const { type, rows } = req.body || {};

  const validation = validateInput(type, rows);
  if (validation) return error(res, validation);

  const config = TYPE_CONFIG[type];
  const items = [];
  const errors = [];
  let newCount = 0;
  let updateCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check required fields
    const missing = config.requiredFields.filter(
      (f) => row[f] === undefined || row[f] === null || row[f] === ''
    );
    if (missing.length > 0) {
      errors.push({ row: i, message: '必須項目が不足: ' + missing.join(', ') });
      continue;
    }

    try {
      // Resolve foreign-key references (e.g. corp_name → corp_id)
      const resolved = await config.resolveRefs(row);
      if (resolved._error) {
        errors.push({ row: i, message: resolved._error });
        continue;
      }

      // Check if record already exists
      const existing = await config.upsertLookup(resolved);
      const action = existing ? 'update' : 'insert';

      if (action === 'update') {
        updateCount++;
      } else {
        newCount++;
      }

      items.push({
        ...resolved,
        _action: action,
        _existingId: existing ? existing.id || null : null,
      });
    } catch (e) {
      errors.push({ row: i, message: e.message });
    }
  }

  return ok(res, {
    items,
    errors,
    summary: {
      total: rows.length,
      newCount,
      updateCount,
      errorCount: errors.length,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/execute
// ---------------------------------------------------------------------------
async function handleExecute(req, res) {
  const { type, rows } = req.body || {};

  const validation = validateInput(type, rows);
  if (validation) return error(res, validation);

  const config = TYPE_CONFIG[type];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check required fields
    const missing = config.requiredFields.filter(
      (f) => row[f] === undefined || row[f] === null || row[f] === ''
    );
    if (missing.length > 0) {
      errors.push({ data: row, message: '必須項目が不足: ' + missing.join(', ') });
      skipped++;
      continue;
    }

    try {
      const resolved = await config.resolveRefs(row);
      if (resolved._error) {
        errors.push({ data: row, message: resolved._error });
        skipped++;
        continue;
      }

      const existing = await config.upsertLookup(resolved);

      // Build DB-ready payload (strip helper fields)
      const payload = buildPayload(type, resolved);

      if (existing) {
        // Partial update: filter out null/empty values
        const partial = {};
        for (const [k, v] of Object.entries(payload)) {
          if (v !== null && v !== undefined && v !== '') {
            partial[k] = v;
          }
        }

        if (Object.keys(partial).length === 0) {
          skipped++;
          continue;
        }

        const existingId = existing.id;

        if (type === 'menu_size') {
          // product_sizes uses composite key
          const { error: upErr } = await supabase
            .from(config.table)
            .update(partial)
            .eq('product_id', existing.product_id)
            .eq('name', existing.name);
          if (upErr) {
            errors.push({ data: row, message: upErr.message });
            skipped++;
            continue;
          }
        } else {
          const { error: upErr } = await supabase
            .from(config.table)
            .update(partial)
            .eq('id', existingId);
          if (upErr) {
            errors.push({ data: row, message: upErr.message });
            skipped++;
            continue;
          }
        }
        updated++;
      } else {
        const { error: insErr } = await supabase
          .from(config.table)
          .insert(payload);
        if (insErr) {
          errors.push({ data: row, message: insErr.message });
          skipped++;
          continue;
        }
        inserted++;
      }
    } catch (e) {
      errors.push({ data: row, message: e.message });
      skipped++;
    }
  }

  return ok(res, { inserted, updated, skipped, errors });
}

// ---------------------------------------------------------------------------
// GET /api/bulk-import/export?type=xxx
// ---------------------------------------------------------------------------
async function handleExport(req, res) {
  const type = req.query.type;

  if (!type || !TYPE_CONFIG[type]) {
    return error(res, '有効なtypeを指定してください: ' + Object.keys(TYPE_CONFIG).join(', '));
  }

  try {
    const data = await TYPE_CONFIG[type].exportQuery();
    return ok(res, { data });
  } catch (e) {
    return error(res, 'エクスポートエラー: ' + e.message, 500);
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
function validateInput(type, rows) {
  if (!type || !TYPE_CONFIG[type]) {
    return '有効なtypeを指定してください: ' + Object.keys(TYPE_CONFIG).join(', ');
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return 'rows は1件以上の配列で指定してください';
  }
  if (rows.length > 500) {
    return '一度にインポートできるのは500件までです';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reference resolvers
// ---------------------------------------------------------------------------
async function noopResolve(row) {
  return { ...row };
}

async function resolveBrandRefs(row) {
  const { corp_name, ...rest } = row;
  const { data: corp } = await supabase
    .from('corporations')
    .select('id')
    .eq('name', corp_name)
    .maybeSingle();
  if (!corp) return { _error: '法人が見つかりません: ' + corp_name };
  return { ...rest, corp_id: corp.id };
}

async function resolveStoreRefs(row) {
  const { brand_slug, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };
  return { ...rest, brand_id: brandId };
}

async function resolveCategoryRefs(row) {
  const { brand_slug, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };
  return { ...rest, brand_id: brandId };
}

async function resolveProductRefs(row) {
  const { brand_slug, category_name, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };

  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('brand_id', brandId)
    .eq('name', category_name)
    .maybeSingle();
  if (!cat) return { _error: 'カテゴリが見つかりません: ' + category_name };

  return { ...rest, brand_id: brandId, category_id: cat.id };
}

async function resolveSizeRefs(row) {
  const { brand_slug, product_name, label, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };

  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('brand_id', brandId)
    .eq('name', product_name)
    .maybeSingle();
  if (!product) return { _error: '商品が見つかりません: ' + product_name };

  return { ...rest, product_id: product.id, name: label };
}

async function resolveBrandSlug(slug) {
  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return brand ? brand.id : null;
}

// ---------------------------------------------------------------------------
// UPSERT lookup functions — find existing record by unique key
// ---------------------------------------------------------------------------
async function lookupCorporation(row) {
  const { data } = await supabase
    .from('corporations')
    .select('id')
    .eq('name', row.name)
    .maybeSingle();
  return data;
}

async function lookupBrand(row) {
  const { data } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', row.slug)
    .maybeSingle();
  return data;
}

async function lookupStore(row) {
  const { data } = await supabase
    .from('stores')
    .select('id')
    .eq('brand_id', row.brand_id)
    .eq('slug', row.slug)
    .maybeSingle();
  return data;
}

async function lookupCategory(row) {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('brand_id', row.brand_id)
    .eq('name', row.name)
    .maybeSingle();
  return data;
}

async function lookupProduct(row) {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('brand_id', row.brand_id)
    .eq('category_id', row.category_id)
    .eq('name', row.name)
    .maybeSingle();
  return data;
}

async function lookupSize(row) {
  const { data } = await supabase
    .from('product_sizes')
    .select('product_id, name')
    .eq('product_id', row.product_id)
    .eq('name', row.name)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Build DB payload — strip helper / non-column fields
// ---------------------------------------------------------------------------
function buildPayload(type, resolved) {
  // Remove internal helper fields
  const cleaned = { ...resolved };
  delete cleaned._error;
  delete cleaned._action;
  delete cleaned._existingId;

  // Remove human-readable reference fields that are not DB columns
  delete cleaned.corp_name;
  delete cleaned.brand_slug;
  delete cleaned.category_name;
  delete cleaned.product_name;
  delete cleaned.label;

  switch (type) {
    case 'corporation':
      return pick(cleaned, ['name', 'representative', 'status', 'website_url', 'recruit_url']);
    case 'brand':
      return pick(cleaned, ['corp_id', 'name', 'slug', 'tagline', 'main_color', 'logo_emoji', 'font']);
    case 'store':
      return pick(cleaned, [
        'brand_id', 'name', 'slug', 'address', 'phone', 'email', 'genre',
        'lat', 'lng', 'has_takeout', 'has_delivery', 'reservation_enabled',
        'min_order_amount', 'prep_time_minutes',
      ]);
    case 'menu_category':
      return pick(cleaned, ['brand_id', 'name', 'sort_order']);
    case 'menu_product':
      return pick(cleaned, [
        'brand_id', 'category_id', 'name', 'description', 'sort_order', 'sale_status',
      ]);
    case 'menu_size':
      return pick(cleaned, ['product_id', 'name', 'price', 'sort_order']);
    default:
      return cleaned;
  }
}

function pick(obj, keys) {
  const result = {};
  for (const k of keys) {
    if (obj[k] !== undefined) {
      result[k] = obj[k];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Export queries — return human-readable data
// ---------------------------------------------------------------------------
async function exportCorporations() {
  const { data, error: err } = await supabase
    .from('corporations')
    .select('id, name, representative, status, website_url, recruit_url')
    .order('name');
  if (err) throw new Error(err.message);
  return data || [];
}

async function exportBrands() {
  const { data, error: err } = await supabase
    .from('brands')
    .select('id, name, slug, tagline, main_color, logo_emoji, font, corporations(name)')
    .order('name');
  if (err) throw new Error(err.message);
  return (data || []).map((b) => ({
    name: b.name,
    slug: b.slug,
    corp_name: b.corporations?.name || '',
    tagline: b.tagline,
    main_color: b.main_color,
    logo_emoji: b.logo_emoji,
    font: b.font,
  }));
}

async function exportStores() {
  const { data, error: err } = await supabase
    .from('stores')
    .select('id, name, slug, address, phone, email, genre, lat, lng, has_takeout, has_delivery, reservation_enabled, min_order_amount, prep_time_minutes, brands(slug)')
    .order('name');
  if (err) throw new Error(err.message);
  return (data || []).map((s) => ({
    name: s.name,
    slug: s.slug,
    brand_slug: s.brands?.slug || '',
    address: s.address,
    phone: s.phone,
    email: s.email,
    genre: s.genre,
    lat: s.lat,
    lng: s.lng,
    has_takeout: s.has_takeout,
    has_delivery: s.has_delivery,
    reservation_enabled: s.reservation_enabled,
    min_order_amount: s.min_order_amount,
    prep_time_minutes: s.prep_time_minutes,
  }));
}

async function exportCategories() {
  const { data, error: err } = await supabase
    .from('categories')
    .select('id, name, sort_order, brands(slug)')
    .order('sort_order');
  if (err) throw new Error(err.message);
  return (data || []).map((c) => ({
    name: c.name,
    brand_slug: c.brands?.slug || '',
    sort_order: c.sort_order,
  }));
}

async function exportProducts() {
  const { data, error: err } = await supabase
    .from('products')
    .select('id, name, description, sort_order, sale_status, brands(slug), categories(name)')
    .order('sort_order');
  if (err) throw new Error(err.message);
  return (data || []).map((p) => ({
    name: p.name,
    brand_slug: p.brands?.slug || '',
    category_name: p.categories?.name || '',
    description: p.description,
    sort_order: p.sort_order,
    sale_status: p.sale_status,
  }));
}

async function exportSizes() {
  const { data, error: err } = await supabase
    .from('product_sizes')
    .select('product_id, name, price, sort_order, products(name, brands(slug))')
    .order('sort_order');
  if (err) throw new Error(err.message);
  return (data || []).map((s) => ({
    product_name: s.products?.name || '',
    brand_slug: s.products?.brands?.slug || '',
    label: s.name,
    price: s.price,
    sort_order: s.sort_order,
  }));
}
