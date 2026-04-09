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
    table: 'corporations',
    displayIdPrefix: 'CRP-',
    selectList: '*',
    selectDetail: '*',
  },
  brands: {
    table: 'brands',
    displayIdPrefix: 'BRD-',
    selectList: '*, corporations(name)',
    selectDetail: '*',
  },
  stores: {
    table: 'stores',
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
        return await handleGet(res, config, id);
      case 'POST':
        return await handlePost(req, res, config, entity);
      case 'PUT':
        return await handlePut(req, res, config, id);
      case 'DELETE':
        return await handleDelete(res, config, id);
      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// ── GET ───────────────────────────────────────────────────
async function handleGet(res, config, id) {
  if (id) {
    const { data, error: dbErr } = await supabase
      .from(config.table)
      .select(config.selectDetail)
      .eq('id', id)
      .single();

    if (dbErr) return error(res, 'レコードが見つかりません', 404);
    return ok(res, { success: true, data });
  }

  const { data, error: dbErr } = await supabase
    .from(config.table)
    .select(config.selectList)
    .order('created_at', { ascending: false });

  if (dbErr) return error(res, dbErr.message, 500);
  return ok(res, { success: true, data });
}

// ── POST ──────────────────────────────────────────────────
async function handlePost(req, res, config, entity) {
  const body = req.body || {};

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

  const body = req.body || {};
  // Don't allow overwriting id or display_id
  delete body.id;
  delete body.display_id;

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
async function handleDelete(res, config, id) {
  if (!id) return error(res, 'IDが必要です', 400);

  const { error: dbErr } = await supabase
    .from(config.table)
    .delete()
    .eq('id', id);

  if (dbErr) return error(res, dbErr.message, 500);
  return ok(res, { success: true });
}
