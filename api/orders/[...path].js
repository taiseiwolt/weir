import { supabase } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { authenticateRequest, requireAuth, isStoreStaffMember } from '../_lib/auth.js';

// AIden 手数料率（チャネル別）
const AIDEN_FEE_RATES = { takeout: 0.040, dinein: 0.038, delivery: 0.040 };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : rawPath.split('/');

  // /api/orders/__root (rewritten from /api/orders)
  if (pathSegments[0] === '__root' || pathSegments.length === 0) {
    return handleOrdersRoot(req, res);
  }

  // /api/orders/[id]/confirm
  if (pathSegments[1] === 'confirm') {
    return handleConfirm(req, res, pathSegments[0]);
  }

  // /api/orders/[id]/cancel
  if (pathSegments[1] === 'cancel') {
    return handleCancel(req, res, pathSegments[0]);
  }

  // /api/orders/[id]/status
  if (pathSegments[1] === 'status') {
    return handleStatus(req, res, pathSegments[0]);
  }

  // /api/orders/[id]
  if (pathSegments[0]) {
    return handleOrderDetail(req, res, pathSegments[0]);
  }

  return error(res, 'Not found', 404);
}

// --- Orders Root: Create / List ---
async function handleOrdersRoot(req, res) {
  if (req.method === 'POST') {
    return handleCreate(req, res);
  } else if (req.method === 'GET') {
    return handleList(req, res);
  }
  return error(res, 'Method not allowed', 405);
}

async function handleCreate(req, res) {
  const auth = await authenticateRequest(req);
  const body = req.body || {};

  const {
    store_id, order_type,
    items,
    member_id,
    brand_id,
    stripe_account_id,
    guest_name, guest_email, guest_phone,
    guest_address_prefecture, guest_address_city, guest_address_street, guest_address_building,
    delivery_address,
    points_used, aiden_points_used, normal_points_used,
    subtotal,
    customer_email, customer_name,
  } = body;

  if (!store_id || !order_type || !items || items.length === 0) {
    return error(res, 'store_id, order_type, items は必須です');
  }
  if (!['dinein', 'takeout', 'delivery'].includes(order_type)) {
    return error(res, 'order_type は dinein/takeout/delivery のいずれかです');
  }

  if (!auth && !member_id) {
    if (!guest_name || !guest_email) {
      return error(res, 'ゲスト注文には名前とメールアドレスが必要です');
    }
    if ((order_type === 'takeout' || order_type === 'delivery') && !guest_phone) {
      return error(res, 'テイクアウト/デリバリーには電話番号が必要です');
    }
    if (order_type === 'delivery' && !delivery_address && !guest_address_prefecture) {
      return error(res, 'デリバリーには配達先住所が必要です');
    }
  }

  try {
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      let unitPrice = 0;

      if (item.size_id) {
        const { data: size } = await supabase
          .from('product_sizes')
          .select('price')
          .eq('id', item.size_id)
          .single();
        unitPrice = size?.price || 0;
      } else {
        const { data: sizes } = await supabase
          .from('product_sizes')
          .select('price, name')
          .eq('product_id', item.product_id)
          .order('sort_order')
          .limit(1);
        unitPrice = sizes?.[0]?.price || 0;

        if (unitPrice === 0) {
          const { data: product } = await supabase
            .from('products')
            .select('price')
            .eq('id', item.product_id)
            .single();
          unitPrice = product?.price || 0;
        }
      }

      let optionTotal = 0;
      if (item.option_item_ids && item.option_item_ids.length > 0) {
        const { data: optionItems } = await supabase
          .from('option_items')
          .select('price_adjustment')
          .in('id', item.option_item_ids);
        optionTotal = (optionItems || []).reduce((sum, oi) => sum + (oi.price_adjustment || 0), 0);
      }

      const itemTotal = (unitPrice + optionTotal) * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        size_id: item.size_id || null,
        quantity: item.quantity,
        unit_price: unitPrice + optionTotal,
        subtotal: itemTotal,
        option_item_ids: item.option_item_ids || [],
      });
    }

    if (totalAmount < 1) return error(res, '注文合計が¥0です');

    let memberId = member_id || null;
    let stripeCustomerId = null;

    if (auth) {
      const { data: member } = await supabase
        .from('members')
        .select('id, stripe_customer_id')
        .eq('auth_user_id', auth.user.id)
        .single();

      if (member) {
        memberId = member.id;
        stripeCustomerId = member.stripe_customer_id;
      }
    }

    const feeRate = AIDEN_FEE_RATES[order_type] || 0.040;
    const applicationFee = Math.round(totalAmount * feeRate);

    const paymentIntentParams = {
      amount: totalAmount,
      currency: 'jpy',
      capture_method: 'manual',
      metadata: {
        store_id, order_type,
        customer_email: customer_email || guest_email || '',
        customer_name: customer_name || guest_name || '',
        points_used: points_used || 0,
        aiden_points_used: aiden_points_used || 0,
        normal_points_used: normal_points_used || 0,
      },
    };

    if (stripeCustomerId) {
      paymentIntentParams.customer = stripeCustomerId;
    }

    // Stripe Connect: 加盟店のConnectアカウントへ送金
    if (stripe_account_id) {
      paymentIntentParams.application_fee_amount = applicationFee;
      paymentIntentParams.transfer_data = { destination: stripe_account_id };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    const deliveryAddr = delivery_address ||
      (guest_address_prefecture ? (guest_address_prefecture + guest_address_city + guest_address_street + (guest_address_building ? ' ' + guest_address_building : '')) : null);

    const orderData = {
      store_id,
      order_type,
      status: 'order_placed',
      total_amount: totalAmount,
      payment_intent_id: paymentIntent.id,
      member_id: memberId,
      brand_id: brand_id || null,
      customer_name: customer_name || (auth ? undefined : guest_name),
      customer_email: customer_email || (auth ? undefined : guest_email),
      customer_phone: auth ? undefined : guest_phone,
      delivery_address: deliveryAddr,
      aiden_points_used: aiden_points_used || 0,
      normal_points_used: normal_points_used || 0,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select('id, tracking_token, status, total_amount, created_at')
      .single();

    if (orderError) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return error(res, '注文の作成に失敗しました: ' + orderError.message, 500);
    }

    const itemInserts = orderItems.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      size_id: item.size_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }));

    await supabase.from('order_items').insert(itemInserts);

    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: { ...paymentIntentParams.metadata, order_id: order.id },
    });

    return ok(res, {
      order_id: order.id,
      tracking_token: order.tracking_token,
      status: order.status,
      total_amount: order.total_amount,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      application_fee: stripe_account_id ? applicationFee : 0,
    }, 201);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Confirm: ポイント処理・ランク更新・レビュートークン生成・メール送信 ---
async function handleConfirm(req, res, id) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const body = req.body || {};
  const {
    member_id, brand_id, payment_intent_id,
    points_used, aiden_points_used, normal_points_used,
    subtotal, total_amount,
    point_settings, member_rank_multi, user_points,
    customer_email, customer_name, payment_method_name,
    items,
  } = body;

  try {
    // 注文の存在確認
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, store_id, order_type, total_amount, payment_intent_id, member_id')
      .eq('id', id)
      .single();

    if (orderErr || !order) return error(res, '注文が見つかりません', 404);

    let earnedPoints = 0;
    let reviewToken = null;
    const memberId = member_id || order.member_id;
    const piId = payment_intent_id || order.payment_intent_id;
    const orderSubtotal = subtotal || order.total_amount;

    // ===== ポイント消費トランザクション =====
    if (memberId && points_used > 0) {
      await supabase.from('point_transactions').insert({
        member_id: memberId,
        amount: -(points_used || 0),
        balance_after: (user_points || 0) - (points_used || 0),
        source: 'normal',
        reason: '注文消費（' + piId + '）',
        order_id: order.id,
      });
    }

    // ===== ポイント付与 =====
    if (memberId && point_settings && point_settings.enabled) {
      const ps = point_settings;
      const baseAmount = orderSubtotal;
      earnedPoints = Math.floor(baseAmount / ps.earn_rate_unit) * ps.earn_rate_point;

      if (member_rank_multi && member_rank_multi > 1) {
        earnedPoints = Math.floor(earnedPoints * member_rank_multi);
      }

      if (earnedPoints > 0) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + (ps.expiry_months || 12));
        const currentBalance = (user_points || 0) - (points_used || 0);

        await supabase.from('point_transactions').insert({
          member_id: memberId,
          brand_id: brand_id || null,
          amount: earnedPoints,
          balance_after: currentBalance + earnedPoints,
          source: 'normal',
          reason: '注文獲得（' + piId + '）',
          order_id: order.id,
          expires_at: expiresAt.toISOString(),
        });
      }
    }

    // ===== ランク判定・更新 =====
    // (total_spend, monthly_order_count はDBトリガーで自動更新済み)
    if (memberId && brand_id) {
      const { data: memberRow } = await supabase
        .from('members')
        .select('id, total_spend, monthly_order_count')
        .eq('id', memberId)
        .single();

      if (memberRow) {
        const { data: ranks } = await supabase
          .from('rank_settings')
          .select('*')
          .eq('brand_id', brand_id)
          .order('sort_order', { ascending: true });

        if (ranks && ranks.length > 0) {
          let bestRank = ranks.find(r => r.is_default) || ranks[ranks.length - 1];
          for (const rank of ranks) {
            if (rank.is_default) continue;
            const meetCount = !rank.cond_monthly_count || memberRow.monthly_order_count >= rank.cond_monthly_count;
            const meetSpend = !rank.cond_total_spend || memberRow.total_spend >= rank.cond_total_spend;
            if (meetCount && meetSpend) {
              bestRank = rank;
              break;
            }
          }
          await supabase.from('members').update({ current_rank_id: bestRank.id }).eq('id', memberId);
        }
      }
    }

    // ===== 口コミトークン生成 =====
    if (memberId && brand_id) {
      const { data: rvSettings } = await supabase
        .from('review_point_settings')
        .select('*')
        .eq('brand_id', brand_id)
        .single();

      if (rvSettings && rvSettings.enabled) {
        const { randomUUID } = await import('crypto');
        reviewToken = randomUUID();
        const tokenExpires = new Date();
        tokenExpires.setDate(tokenExpires.getDate() + (rvSettings.review_link_expiry_days || 7));

        await supabase.from('review_tokens').insert({
          order_id: piId,
          member_id: memberId,
          brand_id,
          token: reviewToken,
          expires_at: tokenExpires.toISOString(),
        });
      }
    }

    // ===== メール送信 =====
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey && customer_email) {
      const emailPayload = {
        type: 'confirmation',
        order_id: piId,
        customer_name: customer_name || '',
        customer_email,
        items: items || [],
        subtotal: orderSubtotal,
        total: total_amount || order.total_amount,
        points_used: points_used || 0,
      };

      // 注文確認メール
      fetch(supabaseUrl + '/functions/v1/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + supabaseAnonKey },
        body: JSON.stringify(emailPayload),
      }).catch(() => {});

      // 領収書メール
      fetch(supabaseUrl + '/functions/v1/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + supabaseAnonKey },
        body: JSON.stringify({
          ...emailPayload,
          type: 'receipt',
          paid_at: new Date().toISOString(),
          payment_method: payment_method_name || 'カード',
          review_token: reviewToken || '',
        }),
      }).catch(() => {});
    }

    return ok(res, {
      order_id: order.id,
      earned_points: earnedPoints,
      review_token: reviewToken,
      confirmed: true,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleList(req, res) {
  const auth = await authenticateRequest(req);
  const { store_id, status, limit = 50, offset = 0 } = req.query;

  // SEC-1: 認証必須。store_id指定時はスタッフ権限も必要
  if (!auth) {
    return error(res, '認証が必要です', 401);
  }

  try {
    let query = supabase
      .from('orders')
      .select('id, store_id, order_type, status, total_amount, tracking_token, created_at, customer_name, member_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (store_id) {
      // store_id指定時: スタッフ権限チェック
      const isStaff = await isStoreStaffMember(auth.user.id, store_id);
      if (!isStaff) {
        return error(res, 'この店舗の注文を閲覧する権限がありません', 403);
      }
      query = query.eq('store_id', store_id);
    } else {
      // store_id未指定: 自分の注文のみ
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', auth.user.id)
        .single();

      if (member) {
        query = query.eq('member_id', member.id);
      } else {
        return ok(res, { orders: [], total: 0 });
      }
    }

    if (status) query = query.eq('status', status);

    const { data: orders, error: dbError, count } = await query;
    if (dbError) return error(res, dbError.message, 500);

    return ok(res, { orders, total: count });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Order Detail ---
async function handleOrderDetail(req, res, id) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  const { tracking_token } = req.query;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const column = isUUID ? 'id' : 'display_id';

    const { data: order, error: dbError } = await supabase
      .from('orders')
      .select('*, order_items(id, product_id, product_name, size_id, quantity, unit_price, subtotal)')
      .eq(column, id)
      .single();

    if (dbError || !order) return error(res, '注文が見つかりません', 404);

    const auth = await authenticateRequest(req);

    if (auth) {
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', auth.user.id)
        .single();

      const isOwner = member && order.member_id === member.id;
      const isStaff = await isStoreStaffMember(auth.user.id, order.store_id);
      if (!isOwner && !isStaff) {
        return error(res, 'アクセス権限がありません', 403);
      }
    } else if (tracking_token) {
      if (order.tracking_token !== tracking_token) {
        return error(res, 'トラッキングトークンが無効です', 403);
      }
    } else {
      return error(res, '認証またはトラッキングトークンが必要です', 401);
    }

    return ok(res, { ...order });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Cancel ---
async function handleCancel(req, res, id) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_intent_id, store_id')
      .eq('id', id)
      .single();

    if (orderError || !order) return error(res, '注文が見つかりません', 404);

    // SEC-3: 店舗スタッフ権限チェック
    const isStaff = await isStoreStaffMember(auth.user.id, order.store_id);
    if (!isStaff) {
      return error(res, 'この注文をキャンセルする権限がありません', 403);
    }

    if (order.status === 'cancelled') return error(res, 'この注文は既にキャンセルされています');

    if (order.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);

        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.cancel(order.payment_intent_id);
        } else if (pi.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: order.payment_intent_id });
        }
      } catch (stripeErr) {
        return error(res, '決済キャンセル/返金に失敗しました: ' + stripeErr.message, 500);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('id, status, updated_at')
      .single();

    if (updateError) return error(res, '更新に失敗しました: ' + updateError.message, 500);

    return ok(res, updated);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Status Update ---
async function handleStatus(req, res, id) {
  if (req.method !== 'PATCH') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { status } = req.body || {};
  const validStatuses = ['order_placed', 'accepted', 'preparing', 'prepared', 'delivering', 'delivered', 'picked_up', 'completed'];

  if (!status || !validStatuses.includes(status)) {
    return error(res, '有効なステータスを指定してください: ' + validStatuses.join(', '));
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_intent_id, total_amount, store_id')
      .eq('id', id)
      .single();

    if (orderError || !order) return error(res, '注文が見つかりません', 404);

    // スタッフ権限チェック
    const isStaff = await isStoreStaffMember(auth.user.id, order.store_id);
    if (!isStaff) {
      return error(res, 'この注文のステータスを変更する権限がありません', 403);
    }

    if (status === 'prepared' && order.payment_intent_id) {
      try {
        await stripe.paymentIntents.capture(order.payment_intent_id);
      } catch (stripeErr) {
        return error(res, '決済キャプチャに失敗しました: ' + stripeErr.message, 500);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('id, status, total_amount, updated_at')
      .single();

    if (updateError) return error(res, '更新に失敗しました: ' + updateError.message, 500);

    return ok(res, {
      ...updated,
      payment_captured: status === 'prepared',
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
