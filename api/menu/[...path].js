import { supabase } from '../_lib/supabase.js';
import { handleCors, ok, error } from '../_lib/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : rawPath.split('/');
  const action = pathSegments[0];

  if (action === 'categories') {
    return handleCategories(req, res);
  } else if (action === 'products') {
    if (pathSegments[1]) {
      return handleProductDetail(req, res, pathSegments[1]);
    }
    return handleProducts(req, res);
  }

  return error(res, 'Not found', 404);
}

async function handleCategories(req, res) {
  const venue_id = req.query.venue_id || req.query.store_id;
  const { brand_id } = req.query;

  if (!venue_id && !brand_id) {
    return error(res, 'venue_id または brand_id が必要です');
  }

  try {
    let targetBrandId = brand_id;

    if (venue_id && !brand_id) {
      const { data: venue } = await supabase
        .from('venues')
        .select('brand_id')
        .eq('id', venue_id)
        .single();

      if (!venue) return error(res, '店舗が見つかりません', 404);
      targetBrandId = venue.brand_id;
    }

    const { data: categories, error: dbError } = await supabase
      .from('categories')
      .select('id, brand_id, name, sort_order')
      .eq('brand_id', targetBrandId)
      .order('sort_order');

    if (dbError) return error(res, dbError.message, 500);

    return ok(res, { categories });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleProducts(req, res) {
  const venue_id = req.query.venue_id || req.query.store_id;
  const { brand_id } = req.query;

  if (!venue_id && !brand_id) {
    return error(res, 'venue_id または brand_id が必要です');
  }

  try {
    if (venue_id) {
      return await getProductsByVenue(res, venue_id);
    } else {
      return await getProductsByBrand(res, brand_id);
    }
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// CC-Option-Master-Stage2a Phase 2: Stage 1 options schema
//   option_groups: group_id / name / selection_type / is_required / sort_order
//   options:       option_id / name / price_delta / is_default / sort_order / is_available
//   product_option_groups: is_required override (NULL → use option_groups.is_required)
// 応答の product_option_groups をフロントが `products.product_option_groups` としてそのまま参照。
const STAGE1_OPTION_SELECT = `
  product_option_groups(
    is_required, sort_order,
    option_groups(
      group_id, name, selection_type, is_required, sort_order,
      options(option_id, name, price_delta, is_default, sort_order, is_available)
    )
  )
`;

async function getProductsByVenue(res, venueId) {
  const { data: pattern } = await supabase
    .from('menu_patterns')
    .select('id')
    .eq('venue_id', venueId)
    .limit(1)
    .single();

  if (!pattern) {
    return ok(res, { products: [], categories: [] });
  }

  const { data: items, error: dbError } = await supabase
    .from('menu_pattern_items')
    .select(`
      id, status, sort_order,
      categories(id, name, sort_order),
      products(
        id, name, price, image_url, description, product_flags,
        product_sizes(id, name, price),
        ${STAGE1_OPTION_SELECT}
      )
    `)
    .eq('pattern_id', pattern.id)
    .eq('status', 'active')
    .order('sort_order');

  if (dbError) return error(res, dbError.message, 500);

  const categoryMap = {};
  const products = [];

  (items || []).forEach(item => {
    if (item.products) {
      const product = {
        ...item.products,
        sort_order: item.sort_order,
        category_id: item.categories?.id,
        category_name: item.categories?.name,
      };
      // product.product_option_groups はそのまま保持（Stage 1 スキーマ）。
      products.push(product);
    }

    if (item.categories && !categoryMap[item.categories.id]) {
      categoryMap[item.categories.id] = item.categories;
    }
  });

  const categories = Object.values(categoryMap).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return ok(res, { products, categories });
}

async function getProductsByBrand(res, brandId) {
  const [catResult, prodResult, sizeResult] = await Promise.all([
    supabase.from('categories').select('id, brand_id, name, sort_order').eq('brand_id', brandId).order('sort_order'),
    supabase.from('products').select(`id, brand_id, category_id, name, description, price, image_url, product_flags, is_available, sort_order, ${STAGE1_OPTION_SELECT}`).eq('brand_id', brandId),
    supabase.from('product_sizes').select('id, product_id, name, price, sort_order'),
  ]);

  if (catResult.error) return error(res, catResult.error.message, 500);

  const sizeMap = {};
  (sizeResult.data || []).forEach(s => {
    if (!sizeMap[s.product_id]) sizeMap[s.product_id] = [];
    sizeMap[s.product_id].push(s);
  });

  const products = (prodResult.data || []).map(p => ({
    ...p,
    product_sizes: sizeMap[p.id] || [],
  }));

  return ok(res, {
    products,
    categories: catResult.data || [],
  });
}

async function handleProductDetail(req, res, id) {
  try {
    const { data: product, error: dbError } = await supabase
      .from('products')
      .select(`
        id, brand_id, category_id, name, description, price, image_url, product_flags, is_available, sort_order,
        product_sizes(id, name, price, sort_order),
        ${STAGE1_OPTION_SELECT}
      `)
      .eq('id', id)
      .single();

    if (dbError) return error(res, '商品が見つかりません', 404);
    // product.product_option_groups はそのまま保持（Stage 1 スキーマ）。

    return ok(res, product);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
