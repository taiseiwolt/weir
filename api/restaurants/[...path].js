import { supabase } from '../_lib/supabase.js';
import { handleCors, ok, error } from '../_lib/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : rawPath.split('/');

  if (pathSegments[0] === 'brands') {
    if (pathSegments[1]) {
      return handleBrandDetail(req, res, pathSegments[1]);
    }
    return handleBrandsList(req, res);
  } else if (pathSegments[0] === 'stores') {
    if (pathSegments[1]) {
      return handleStoreDetail(req, res, pathSegments[1]);
    }
    return handleStoresList(req, res);
  }

  return error(res, 'Not found', 404);
}

async function handleBrandsList(req, res) {
  try {
    const { data: brands, error: dbError } = await supabase
      .from('brands')
      .select('*')
      .order('name');

    if (dbError) return error(res, dbError.message, 500);

    return ok(res, { brands });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleBrandDetail(req, res, id) {
  try {
    const { data: brand, error: dbError } = await supabase
      .from('brands')
      .select('*')
      .eq('id', id)
      .single();

    if (dbError) return error(res, 'ブランドが見つかりません', 404);

    const [newsResult, mediaResult, storesResult] = await Promise.all([
      supabase.from('brand_news').select('*').eq('brand_id', id).order('published_at', { ascending: false }).limit(20),
      supabase.from('media').select('*').eq('entity_type', 'brand').eq('entity_id', id).order('sort_order'),
      supabase.from('stores').select('id, name, slug, address, lat, lng, is_active').eq('brand_id', id).eq('is_active', true).order('name'),
    ]);

    return ok(res, {
      ...brand,
      news: newsResult.data || [],
      media: mediaResult.data || [],
      stores: storesResult.data || [],
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleStoresList(req, res) {
  const { brand_id, limit = 100, offset = 0 } = req.query;

  try {
    let query = supabase
      .from('stores')
      .select('id, name, slug, brand_id, address, phone, lat, lng, is_active, brands(id, name)', { count: 'exact' })
      .eq('is_active', true)
      .order('name')
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (brand_id) {
      query = query.eq('brand_id', brand_id);
    }

    const { data: stores, error: dbError, count } = await query;
    if (dbError) return error(res, dbError.message, 500);

    const storeIds = stores.map(s => s.id);

    const [hoursResult, servicesResult] = await Promise.all([
      supabase.from('store_hours').select('store_id, day_of_week, open_time, close_time').in('store_id', storeIds).order('day_of_week'),
      supabase.from('service_subscriptions').select('entity_id, service_key').eq('entity_type', 'store').in('entity_id', storeIds).eq('is_active', true),
    ]);

    const hoursMap = {};
    (hoursResult.data || []).forEach(h => {
      if (!hoursMap[h.store_id]) hoursMap[h.store_id] = [];
      hoursMap[h.store_id].push(h);
    });

    const servicesMap = {};
    (servicesResult.data || []).forEach(s => {
      if (!servicesMap[s.entity_id]) servicesMap[s.entity_id] = [];
      servicesMap[s.entity_id].push(s.service_key);
    });

    const result = stores.map(store => ({
      ...store,
      store_hours: hoursMap[store.id] || [],
      services: servicesMap[store.id] || [],
    }));

    return ok(res, { stores: result, total: count });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleStoreDetail(req, res, slug) {
  try {
    let query = supabase
      .from('stores')
      .select('*, brands(id, name)')
      .eq('slug', slug);

    let { data: store, error: dbError } = await query.single();

    if (dbError && slug.includes('-')) {
      const { data: storeById, error: idError } = await supabase
        .from('stores')
        .select('*, brands(id, name)')
        .eq('id', slug)
        .single();
      if (!idError) store = storeById;
      else return error(res, '店舗が見つかりません', 404);
    } else if (dbError) {
      return error(res, '店舗が見つかりません', 404);
    }

    const [hoursResult, mediaResult, servicesResult] = await Promise.all([
      supabase.from('store_hours').select('*').eq('store_id', store.id).order('day_of_week'),
      supabase.from('media').select('*').eq('entity_type', 'store').eq('entity_id', store.id).order('sort_order'),
      supabase.from('service_subscriptions').select('service_key').eq('entity_type', 'store').eq('entity_id', store.id).eq('is_active', true),
    ]);

    return ok(res, {
      ...store,
      store_hours: hoursResult.data || [],
      media: mediaResult.data || [],
      services: (servicesResult.data || []).map(s => s.service_key),
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
