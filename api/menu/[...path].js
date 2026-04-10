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
  const { store_id, brand_id } = req.query;

  if (!store_id && !brand_id) {
    return error(res, 'store_id または brand_id が必要です');
  }

  try {
    let targetBrandId = brand_id;

    if (store_id && !brand_id) {
      const { data: store } = await supabase
        .from('venues')
        .select('brand_id')
        .eq('id', store_id)
        .single();

      if (!store) return error(res, '店舗が見つかりません', 404);
      targetBrandId = store.brand_id;
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
  const { store_id, brand_id } = req.query;

  if (!store_id && !brand_id) {
    return error(res, 'store_id または brand_id が必要です');
  }

  try {
    if (store_id) {
      return await getProductsByStore(res, store_id);
    } else {
      return await getProductsByBrand(res, brand_id);
    }
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function getProductsByStore(res, storeId) {
  const { data: pattern } = await supabase
    .from('menu_patterns')
    .select('id')
    .eq('venue_id', storeId)
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
        id, name, price, image_url, description, tags,
        product_sizes(id, name, price),
        product_option_groups(
          id, sort_order,
          option_groups(
            id, name, is_required, max_select, min_select,
            option_items(id, name, price_adjustment, sort_order)
          )
        )
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

      if (product.product_option_groups) {
        product.option_groups = product.product_option_groups
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(pog => pog.option_groups)
          .filter(Boolean);
        delete product.product_option_groups;
      }

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
    supabase.from('products').select('id, brand_id, category_id, name, description, price, image_url, tags, is_available, sort_order').eq('brand_id', brandId),
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
        id, brand_id, category_id, name, description, price, image_url, tags, is_available, sort_order,
        product_sizes(id, name, price, sort_order),
        product_option_groups(
          id, sort_order,
          option_groups(
            id, name, is_required, max_select, min_select,
            option_items(id, name, price_adjustment, sort_order)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (dbError) return error(res, '商品が見つかりません', 404);

    if (product.product_option_groups) {
      product.option_groups = product.product_option_groups
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(pog => pog.option_groups)
        .filter(Boolean);
      delete product.product_option_groups;
    }

    return ok(res, product);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
