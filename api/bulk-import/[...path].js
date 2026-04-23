import { handleCors, ok, error } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';
import { supabase } from '../_lib/supabase.js';

// ---------------------------------------------------------------------------
// Supported entity types and their configuration
// ---------------------------------------------------------------------------
// Allowed product flag values (D-47)
const PRODUCT_FLAGS = ['おすすめ', '新商品', '期間限定', '人気'];

const TYPE_CONFIG = {
  corporation: {
    table: 'merchants',
    label: '法人',
    requiredFields: ['name'],
    upsertLookup: lookupCorporation,
    resolveRefs: noopResolve,
    exportQuery: exportCorporations,
  },
  brand: {
    table: 'brands',
    label: 'ブランド',
    requiredFields: ['name', 'slug', 'corp_name'],
    upsertLookup: lookupBrand,
    resolveRefs: resolveBrandRefs,
    exportQuery: exportBrands,
  },
  store: {
    table: 'venues',
    label: '店舗',
    requiredFields: ['name', 'brand_slug'],
    upsertLookup: lookupStore,
    resolveRefs: resolveStoreRefs,
    exportQuery: exportStores,
  },
  menu_category: {
    table: 'categories',
    label: 'メニューカテゴリ',
    requiredFields: ['brand_slug', 'name'],
    upsertLookup: lookupCategory,
    resolveRefs: resolveCategoryRefs,
    exportQuery: exportCategories,
  },
  menu_product: {
    table: 'products',
    label: 'メニュー商品',
    requiredFields: ['brand_slug', 'category_name', 'name'],
    upsertLookup: lookupProduct,
    resolveRefs: resolveProductRefs,
    exportQuery: exportProducts,
  },
  menu_size: {
    table: 'product_sizes',
    label: '商品サイズ',
    requiredFields: ['brand_slug', 'product_name', 'label', 'price'],
    upsertLookup: lookupSize,
    resolveRefs: resolveSizeRefs,
    exportQuery: exportSizes,
  },
  // CC-Option-Master-Stage1 (D-242 β) types
  option_group: {
    table: 'option_groups',
    label: 'オプショングループ',
    requiredFields: ['brand_slug', 'name', 'selection_type'],
    upsertLookup: lookupOptionGroup,
    resolveRefs: resolveOptionGroupRefs,
    exportQuery: exportOptionGroups,
    pkColumn: 'group_id',
  },
  option: {
    table: 'options',
    label: 'オプション選択肢',
    requiredFields: ['brand_slug', 'group_name', 'name'],
    upsertLookup: lookupOption,
    resolveRefs: resolveOptionRefs,
    exportQuery: exportOptions,
    pkColumn: 'option_id',
  },
  product_option_group: {
    table: 'product_option_groups',
    label: '商品オプション連携',
    requiredFields: ['brand_slug', 'product_name', 'group_name'],
    upsertLookup: lookupProductOptionGroup,
    resolveRefs: resolveProductOptionGroupRefs,
    exportQuery: exportProductOptionGroups,
  },
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  // Require admin/owner role (staff_accounts with owner or admin role)
  const isAdmin = await checkAdminRole(auth.user);
  if (!isAdmin) return error(res, '管理者権限が必要です', 403);

  const rawPath = req.query.path || '';
  const segments = (Array.isArray(rawPath) ? rawPath.join('/') : rawPath)
    .split('/')
    .filter(Boolean);

  const route = segments[0];

  if (route === 'preview' && req.method === 'POST') {
    return handlePreview(req, res, auth);
  }
  if (route === 'execute' && req.method === 'POST') {
    return handleExecute(req, res, auth);
  }
  if (route === 'delete-preview' && req.method === 'POST') {
    return handleDeletePreview(req, res, auth);
  }
  if (route === 'delete-execute' && req.method === 'POST') {
    return handleDeleteExecute(req, res, auth);
  }
  if (route === 'export' && req.method === 'GET') {
    return handleExport(req, res);
  }
  if (route === 'fuzzy-brand' && req.method === 'POST') {
    return handleFuzzyBrand(req, res);
  }

  return error(res, 'Not found', 404);
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/preview
// ---------------------------------------------------------------------------
async function handlePreview(req, res, auth) {
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
async function handleExecute(req, res, auth) {
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
        const pkCol = config.pkColumn || 'id';

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
            .eq(pkCol, existingId);
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

  // Audit log
  await writeAuditLog(auth, {
    action: 'bulk_import_execute',
    entity_type: type,
    details: { inserted, updated, skipped, error_count: errors.length },
    log_level: errors.length > 0 ? 'WARN' : 'INFO',
  });

  return ok(res, { inserted, updated, skipped, errors });
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/delete-preview
// Preview rows targeted for deletion. Same lookup mechanism as preview,
// but returns existing records flagged as "will delete".
// ---------------------------------------------------------------------------
async function handleDeletePreview(req, res, auth) {
  const { type, rows } = req.body || {};
  const validation = validateInput(type, rows);
  if (validation) return error(res, validation);

  const config = TYPE_CONFIG[type];
  const items = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const resolved = await config.resolveRefs(row);
      if (resolved._error) {
        errors.push({ row: i, message: resolved._error });
        continue;
      }
      const existing = await config.upsertLookup(resolved);
      if (!existing) {
        errors.push({ row: i, message: '該当レコードが見つかりません' });
        continue;
      }
      items.push({ ...resolved, _existingId: existing.id || null });
    } catch (e) {
      errors.push({ row: i, message: e.message });
    }
  }

  return ok(res, {
    items,
    errors,
    summary: { total: rows.length, deleteCount: items.length, errorCount: errors.length },
  });
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/delete-execute
// Requires body.confirm === true to prevent accidental calls.
// ---------------------------------------------------------------------------
async function handleDeleteExecute(req, res, auth) {
  const { type, rows, confirm } = req.body || {};
  if (confirm !== true) {
    return error(res, '削除実行には confirm:true が必要です');
  }
  const validation = validateInput(type, rows);
  if (validation) return error(res, validation);

  const config = TYPE_CONFIG[type];
  let deleted = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const resolved = await config.resolveRefs(row);
      if (resolved._error) {
        errors.push({ data: row, message: resolved._error });
        skipped++;
        continue;
      }
      const existing = await config.upsertLookup(resolved);
      if (!existing) {
        errors.push({ data: row, message: '該当レコードが見つかりません' });
        skipped++;
        continue;
      }

      if (type === 'menu_size') {
        const { error: delErr } = await supabase
          .from(config.table)
          .delete()
          .eq('product_id', existing.product_id)
          .eq('name', existing.name);
        if (delErr) {
          errors.push({ data: row, message: delErr.message });
          skipped++;
          continue;
        }
      } else {
        const pkCol = config.pkColumn || 'id';
        const { error: delErr } = await supabase
          .from(config.table)
          .delete()
          .eq(pkCol, existing.id);
        if (delErr) {
          errors.push({ data: row, message: delErr.message });
          skipped++;
          continue;
        }
      }
      deleted++;
    } catch (e) {
      errors.push({ data: row, message: e.message });
      skipped++;
    }
  }

  await writeAuditLog(auth, {
    action: 'bulk_import_delete',
    entity_type: type,
    details: { deleted, skipped, error_count: errors.length },
    log_level: errors.length > 0 ? 'WARN' : 'INFO',
  });

  return ok(res, { deleted, skipped, errors });
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/fuzzy-brand
// Return similar brand names for a given input string (Levenshtein-based).
// Used by the UI to warn on possible typos.
// ---------------------------------------------------------------------------
async function handleFuzzyBrand(req, res) {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') {
    return error(res, 'name が必要です');
  }
  const target = name.trim();
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name, slug')
    .limit(2000);
  if (!brands) return ok(res, { matches: [] });

  // Exact match first
  const exact = brands.find((b) => b.name === target);
  if (exact) {
    return ok(res, { exact: exact, matches: [] });
  }

  // Fuzzy: Levenshtein distance <= max(2, floor(length/4))
  const threshold = Math.max(2, Math.floor(target.length / 4));
  const matches = [];
  for (const b of brands) {
    const dist = levenshtein(target, b.name);
    if (dist > 0 && dist <= threshold) {
      matches.push({ name: b.name, slug: b.slug, distance: dist });
    }
  }
  matches.sort((a, b) => a.distance - b.distance);
  return ok(res, { exact: null, matches: matches.slice(0, 5) });
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// ---------------------------------------------------------------------------
// Audit log writer (best-effort; failures do not break the request)
// ---------------------------------------------------------------------------
async function writeAuditLog(auth, payload) {
  try {
    await supabase.from('audit_logs').insert({
      action: payload.action,
      entity_type: payload.entity_type,
      actor_email: auth?.user?.email || null,
      user_email: auth?.user?.email || null,
      details: payload.details || {},
      log_level: payload.log_level || 'INFO',
    });
  } catch (_e) {
    // Audit log is best-effort; swallow errors
  }
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
// Admin role check
// ---------------------------------------------------------------------------
async function checkAdminRole(user) {
  const { data } = await supabase
    .from('staff_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1);
  return data && data.length > 0;
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
    .from('merchants')
    .select('id')
    .eq('name', corp_name)
    .maybeSingle();
  if (!corp) return { _error: '法人が見つかりません: ' + corp_name };
  return { ...rest, merchant_id: corp.id };
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
  const { brand_slug, category_name, menu_pattern_code, product_flags, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };

  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('brand_id', brandId)
    .eq('name', category_name)
    .maybeSingle();
  if (!cat) return { _error: 'カテゴリが見つかりません: ' + category_name };

  const out = { ...rest, brand_id: brandId, category_id: cat.id };

  // Resolve menu_pattern_code (D-39) — optional
  if (menu_pattern_code) {
    const { data: mp } = await supabase
      .from('menu_patterns')
      .select('id')
      .eq('brand_id', brandId)
      .eq('code', menu_pattern_code)
      .maybeSingle();
    if (!mp) return { _error: 'メニューパターンが見つかりません: ' + menu_pattern_code };
    out.menu_pattern_id = mp.id;
  }

  // Product flags (D-47) — comma/pipe-separated string → string[] for products.product_flags
  if (product_flags !== undefined && product_flags !== '') {
    let flagList;
    if (Array.isArray(product_flags)) {
      flagList = product_flags;
    } else {
      flagList = String(product_flags).split(/[,|、]/).map((s) => s.trim()).filter(Boolean);
    }
    const invalid = flagList.filter((t) => !PRODUCT_FLAGS.includes(t));
    if (invalid.length > 0) {
      return { _error: '無効な商品フラグ: ' + invalid.join(', ') + '（許可: ' + PRODUCT_FLAGS.join('/') + '）' };
    }
    out.product_flags = flagList;
  }

  return out;
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

// ---------------------------------------------------------------------------
// CC-Option-Master-Stage1 (D-242 β) resolvers
// ---------------------------------------------------------------------------
async function resolveOptionGroupRefs(row) {
  const { brand_slug, selection_type, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };
  if (selection_type !== 'single' && selection_type !== 'multiple') {
    return { _error: '選択タイプは single / multiple のいずれかを指定してください（現: ' + selection_type + '）' };
  }
  return { ...rest, brand_id: brandId, selection_type };
}

async function resolveOptionRefs(row) {
  const { brand_slug, group_name, price_delta, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };

  const { data: group } = await supabase
    .from('option_groups')
    .select('group_id')
    .eq('brand_id', brandId)
    .eq('name', group_name)
    .maybeSingle();
  if (!group) return { _error: 'オプショングループが見つかりません: ' + group_name };

  const out = { ...rest, group_id: group.group_id };

  // price_delta: allow negative, empty → 0
  if (price_delta === undefined || price_delta === '' || price_delta === null) {
    out.price_delta = 0;
  } else {
    const parsed = parseInt(price_delta, 10);
    if (isNaN(parsed)) {
      return { _error: '価格差分は整数で指定してください（現: ' + price_delta + '）' };
    }
    out.price_delta = parsed;
  }

  return out;
}

async function resolveProductOptionGroupRefs(row) {
  const { brand_slug, product_name, group_name, is_required, ...rest } = row;
  const brandId = await resolveBrandSlug(brand_slug);
  if (!brandId) return { _error: 'ブランドが見つかりません: ' + brand_slug };

  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('brand_id', brandId)
    .eq('name', product_name)
    .maybeSingle();
  if (!product) return { _error: '商品が見つかりません: ' + product_name };

  const { data: group } = await supabase
    .from('option_groups')
    .select('group_id')
    .eq('brand_id', brandId)
    .eq('name', group_name)
    .maybeSingle();
  if (!group) return { _error: 'オプショングループが見つかりません: ' + group_name };

  const out = { ...rest, product_id: product.id, group_id: group.group_id };

  // is_required: empty/undefined → NULL (use group default), ON → true, OFF → false
  if (is_required === '' || is_required === undefined || is_required === null) {
    out.is_required = null;
  } else if (is_required === true || is_required === 'ON' || is_required === 'true') {
    out.is_required = true;
  } else if (is_required === false || is_required === 'OFF' || is_required === 'false') {
    out.is_required = false;
  } else {
    return { _error: '必須上書きは 空欄 / ON / OFF のいずれかで指定してください（現: ' + is_required + '）' };
  }

  return out;
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
    .from('merchants')
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
  // Prefer slug match; fall back to name match if slug is empty
  if (row.slug) {
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('brand_id', row.brand_id)
      .eq('slug', row.slug)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from('venues')
    .select('id')
    .eq('brand_id', row.brand_id)
    .eq('name', row.name)
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

// CC-Option-Master-Stage1 (D-242 β) lookups
async function lookupOptionGroup(row) {
  const { data } = await supabase
    .from('option_groups')
    .select('group_id')
    .eq('brand_id', row.brand_id)
    .eq('name', row.name)
    .maybeSingle();
  return data ? { id: data.group_id } : null;
}

async function lookupOption(row) {
  const { data } = await supabase
    .from('options')
    .select('option_id')
    .eq('group_id', row.group_id)
    .eq('name', row.name)
    .maybeSingle();
  return data ? { id: data.option_id } : null;
}

async function lookupProductOptionGroup(row) {
  const { data } = await supabase
    .from('product_option_groups')
    .select('id')
    .eq('product_id', row.product_id)
    .eq('group_id', row.group_id)
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
  delete cleaned.group_name;

  switch (type) {
    case 'corporation':
      return pick(cleaned, ['name', 'representative', 'status', 'website_url', 'recruit_url']);
    case 'brand':
      return pick(cleaned, [
        'merchant_id', 'name', 'slug', 'tagline',
        'main_color', 'secondary_color', 'logo_emoji', 'custom_domain',
      ]);
    case 'store':
      return pick(cleaned, [
        'brand_id', 'name', 'slug', 'address', 'phone', 'email', 'genre',
        'lat', 'lng', 'has_takeout', 'has_delivery', 'reservation_enabled',
        'min_order_amount', 'prep_time_minutes',
        // Phase 3 facility columns
        'seats', 'smoking_policy', 'children_policy',
        'service_charge_type', 'service_charge_value',
        // Reservation extras
        'reservation_confirmation_mode', 'reservation_require_card',
        'reservation_cancellation_fee', 'reservation_cancel_deadline_hours',
        'is_paused',
      ]);
    case 'menu_category':
      return pick(cleaned, ['brand_id', 'name', 'sort_order']);
    case 'menu_product':
      return pick(cleaned, [
        'brand_id', 'category_id', 'name', 'description',
        'price', 'image_url', 'sort_order', 'is_available',
        'menu_pattern_id', 'product_flags',
      ]);
    case 'menu_size':
      return pick(cleaned, ['product_id', 'name', 'price', 'sort_order']);
    // CC-Option-Master-Stage1 (D-242 β)
    case 'option_group':
      return pick(cleaned, ['brand_id', 'name', 'selection_type', 'is_required', 'sort_order', 'is_available']);
    case 'option':
      return pick(cleaned, ['group_id', 'name', 'price_delta', 'is_default', 'sort_order', 'is_available']);
    case 'product_option_group':
      return pick(cleaned, ['product_id', 'group_id', 'sort_order', 'is_required']);
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
    .from('merchants')
    .select('id, name, representative, status, website_url, recruit_url')
    .order('name')
    .limit(5000);
  if (err) throw new Error(err.message);
  return data || [];
}

async function exportBrands() {
  const { data, error: err } = await supabase
    .from('brands')
    .select('id, name, slug, tagline, main_color, secondary_color, logo_emoji, custom_domain, corporations:merchants(name)')
    .order('name')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((b) => ({
    name: b.name,
    slug: b.slug,
    corp_name: b.corporations?.name || '',
    tagline: b.tagline,
    main_color: b.main_color,
    secondary_color: b.secondary_color,
    logo_emoji: b.logo_emoji,
    custom_domain: b.custom_domain,
  }));
}

async function exportStores() {
  const { data, error: err } = await supabase
    .from('venues')
    .select(
      'id, name, slug, address, phone, email, genre, lat, lng, ' +
      'has_takeout, has_delivery, reservation_enabled, min_order_amount, prep_time_minutes, ' +
      'seats, smoking_policy, children_policy, service_charge_type, service_charge_value, ' +
      'reservation_confirmation_mode, reservation_require_card, reservation_cancellation_fee, ' +
      'reservation_cancel_deadline_hours, is_paused, brands(slug)'
    )
    .order('name')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((s) => ({
    brand_slug: s.brands?.slug || '',
    name: s.name,
    slug: s.slug,
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
    seats: s.seats,
    smoking_policy: s.smoking_policy,
    children_policy: s.children_policy,
    service_charge_type: s.service_charge_type,
    service_charge_value: s.service_charge_value,
    reservation_confirmation_mode: s.reservation_confirmation_mode,
    reservation_require_card: s.reservation_require_card,
    reservation_cancellation_fee: s.reservation_cancellation_fee,
    reservation_cancel_deadline_hours: s.reservation_cancel_deadline_hours,
    is_paused: s.is_paused,
  }));
}

async function exportCategories() {
  const { data, error: err } = await supabase
    .from('categories')
    .select('id, name, sort_order, brands(slug)')
    .order('sort_order')
    .limit(5000);
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
    .select(
      'id, name, description, price, image_url, sort_order, is_available, product_flags, ' +
      'brands(slug), categories(name), menu_patterns(code)'
    )
    .order('sort_order')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((p) => ({
    brand_slug: p.brands?.slug || '',
    category_name: p.categories?.name || '',
    name: p.name,
    description: p.description,
    price: p.price,
    image_url: p.image_url,
    sort_order: p.sort_order,
    is_available: p.is_available,
    menu_pattern_code: p.menu_patterns?.code || '',
    product_flags: Array.isArray(p.product_flags) ? p.product_flags.join('|') : '',
  }));
}

async function exportSizes() {
  const { data, error: err } = await supabase
    .from('product_sizes')
    .select('product_id, name, price, sort_order, products(name, brands(slug))')
    .order('sort_order')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((s) => ({
    product_name: s.products?.name || '',
    brand_slug: s.products?.brands?.slug || '',
    label: s.name,
    price: s.price,
    sort_order: s.sort_order,
  }));
}

// ---------------------------------------------------------------------------
// CC-Option-Master-Stage1 (D-242 β) export queries
// ---------------------------------------------------------------------------
async function exportOptionGroups() {
  const { data, error: err } = await supabase
    .from('option_groups')
    .select('group_id, name, selection_type, is_required, sort_order, is_available, brands(slug)')
    .order('sort_order')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((g) => ({
    brand_slug: g.brands?.slug || '',
    name: g.name,
    selection_type: g.selection_type,
    is_required: g.is_required,
    sort_order: g.sort_order,
    is_available: g.is_available,
  }));
}

async function exportOptions() {
  const { data, error: err } = await supabase
    .from('options')
    .select('option_id, name, price_delta, is_default, sort_order, is_available, option_groups(name, brands(slug))')
    .order('sort_order')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((o) => ({
    brand_slug: o.option_groups?.brands?.slug || '',
    group_name: o.option_groups?.name || '',
    name: o.name,
    price_delta: o.price_delta,
    is_default: o.is_default,
    sort_order: o.sort_order,
    is_available: o.is_available,
  }));
}

async function exportProductOptionGroups() {
  const { data, error: err } = await supabase
    .from('product_option_groups')
    .select('id, sort_order, is_required, products(name, brands(slug)), option_groups(name)')
    .order('sort_order')
    .limit(5000);
  if (err) throw new Error(err.message);
  return (data || []).map((pog) => ({
    brand_slug: pog.products?.brands?.slug || '',
    product_name: pog.products?.name || '',
    group_name: pog.option_groups?.name || '',
    sort_order: pog.sort_order,
    is_required: pog.is_required,
  }));
}
