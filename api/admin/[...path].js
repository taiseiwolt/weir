import { supabase } from '../_lib/supabase.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';

// ── Display ID generator ──────────────────────────────────
function generateDisplayId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 7; i++) result += chars[Math.floor(Math.random() * 62)];
  return prefix + result;
}

// ── Entity config ─────────────────────────────────────────
const ENTITY_CONFIG = {
  corporations: {
    table: 'merchants',
    displayIdPrefix: 'CRP-',
    selectList: '*',
    selectDetail: '*',
  },
  brands: {
    table: 'brands',
    displayIdPrefix: 'BRD-',
    selectList: '*, merchants(name)',
    selectDetail: '*',
  },
  stores: {
    table: 'venues',
    displayIdPrefix: 'STR-',
    selectList: '*, brands(name, slug)',
    selectDetail: '*',
  },
  'staff-accounts': {
    table: 'staff_accounts',
    displayIdPrefix: 'ACC-',
    selectList: '*',
    selectDetail: '*',
  },
  'service-subscriptions': {
    table: 'service_subscriptions',
    displayIdPrefix: null,
    selectList: '*',
    selectDetail: '*',
  },
  'menu-patterns': {
    table: 'menu_patterns',
    displayIdPrefix: null,
    selectList: '*',
    selectDetail: '*',
    listFilters: ['brand_id'],
    orderBy: { column: 'code', ascending: true },
    writableFields: ['name', 'is_active'],
  },
};

// ── Admin check ───────────────────────────────────────────
async function isAdmin(user) {
  // SEC: staff_accountsのロールベースチェックのみに依存 (04-P1-3)
  const { data } = await supabase
    .from('staff_accounts')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .in('role', ['owner', 'platform_admin', 'corp_admin'])
    .limit(1);

  return !!(data && data.length > 0);
}

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Auth
  const auth = await requireAuth(req, res);
  if (!auth) return;

  // Admin check
  const admin = await isAdmin(auth.user);
  if (!admin) return error(res, '管理者権限が必要です', 403);

  // Parse path — prefer req.query.path, fallback to URL parsing
  let rawPath = req.query.path || [];
  let segments = (Array.isArray(rawPath) ? rawPath : rawPath.split('/')).filter(Boolean);

  // Fallback: parse from req.url if query.path is empty
  if (segments.length === 0 && req.url) {
    const urlPath = req.url.split('?')[0];
    const parts = urlPath.split('/').filter(Boolean);
    const adminIdx = parts.indexOf('admin');
    if (adminIdx >= 0) {
      segments = parts.slice(adminIdx + 1);
    }
  }

  const entity = segments[0];
  const id = segments[1];

  if (!entity || !ENTITY_CONFIG[entity]) {
    return error(res, `Unknown entity: ${entity}`, 404);
  }

  const config = ENTITY_CONFIG[entity];

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, config, id);
      case 'POST':
        return await handlePost(req, res, config, entity);
      case 'PUT':
        return await handlePut(req, res, config, id);
      case 'DELETE':
        return await handleDelete(res, config, id, entity);
      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// ── GET ───────────────────────────────────────────────────
async function handleGet(req, res, config, id) {
  if (id) {
    const { data, error: dbErr } = await supabase
      .from(config.table)
      .select(config.selectDetail)
      .eq('id', id)
      .single();

    if (dbErr) return error(res, 'レコードが見つかりません', 404);
    return ok(res, { success: true, data });
  }

  let query = supabase.from(config.table).select(config.selectList);

  // Apply list filters from query params (whitelisted per entity)
  if (config.listFilters) {
    for (const filter of config.listFilters) {
      const val = req.query && req.query[filter];
      if (val) query = query.eq(filter, val);
    }
  }

  // Order
  if (config.orderBy) {
    query = query.order(config.orderBy.column, { ascending: !!config.orderBy.ascending });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error: dbErr } = await query;
  if (dbErr) return error(res, dbErr.message, 500);
  return ok(res, { success: true, data });
}

// ── venues カラム名マッピング ─────────────────────────────
// 旧名 → 実カラム名。`is_active` は存在しない列のため drop する（status 列はデフォルト'active'）
function normalizeStoresBody(body) {
  const b = { ...body };
  if ('takeout_enabled' in b) { b.has_takeout = b.takeout_enabled; delete b.takeout_enabled; }
  if ('delivery_enabled' in b) { b.has_delivery = b.delivery_enabled; delete b.delivery_enabled; }
  delete b.is_active;
  return b;
}

// ── POST ──────────────────────────────────────────────────
async function handlePost(req, res, config, entity) {
  let body = req.body || {};

  if (entity === 'stores') body = normalizeStoresBody(body);

  // Auto-generate display_id for entities that need it
  if (config.displayIdPrefix) {
    body.display_id = generateDisplayId(config.displayIdPrefix);
  }

  // Service subscriptions use upsert
  if (entity === 'service-subscriptions') {
    const { data, error: dbErr } = await supabase
      .from(config.table)
      .upsert(body, { onConflict: 'entity_type,entity_id,service_key' })
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 500);
    return ok(res, { success: true, data }, 201);
  }

  const { data, error: dbErr } = await supabase
    .from(config.table)
    .insert(body)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 500);
  return ok(res, { success: true, data }, 201);
}

// ── PUT ───────────────────────────────────────────────────
async function handlePut(req, res, config, id) {
  if (!id) return error(res, 'IDが必要です', 400);

  const raw = req.body || {};
  // Don't allow overwriting id or display_id
  delete raw.id;
  delete raw.display_id;

  // Per-entity writable field whitelist
  let body = raw;
  if (config.writableFields) {
    body = {};
    for (const f of config.writableFields) {
      if (f in raw) body[f] = raw[f];
    }
  }

  if (config.table === 'venues') body = normalizeStoresBody(body);

  const { data, error: dbErr } = await supabase
    .from(config.table)
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 500);
  return ok(res, { success: true, data });
}

// ── DELETE ────────────────────────────────────────────────
async function handleDelete(res, config, id, entity) {
  if (!id) return error(res, 'IDが必要です', 400);

  // Special cascade: menu-patterns must also delete related products and product_sizes.
  // products.menu_pattern_id uses ON DELETE SET NULL, and admin master operates
  // across merchants via service_role, so we must do the cascade here.
  if (entity === 'menu-patterns') {
    const { data: products, error: pSelErr } = await supabase
      .from('products')
      .select('id')
      .eq('menu_pattern_id', id);
    if (pSelErr) return error(res, pSelErr.message, 500);

    const productIds = (products || []).map((p) => p.id);
    if (productIds.length > 0) {
      const { error: psErr } = await supabase
        .from('product_sizes')
        .delete()
        .in('product_id', productIds);
      if (psErr) return error(res, psErr.message, 500);

      const { error: pDelErr } = await supabase
        .from('products')
        .delete()
        .in('id', productIds);
      if (pDelErr) return error(res, pDelErr.message, 500);
    }
  }

  const { error: dbErr } = await supabase
    .from(config.table)
    .delete()
    .eq('id', id);

  if (dbErr) return error(res, dbErr.message, 500);
  return ok(res, { success: true });
}
