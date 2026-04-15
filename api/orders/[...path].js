import { supabase } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { authenticateRequest, requireAuth, isStoreStaffMember } from '../_lib/auth.js';

// Weir 手数料率（チャネル別）
const AIDEN_FEE_RATES = { takeout: 0.040, dinein: 0.038, delivery: 0.040 };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Query-based routing (from vercel.json rewrites: ?id=xxx&action=yyy)
  // Priority: query params > catch-all path segments
  const qId = req.query.id;
  const qAction = req.query.action;

  // If rewrites provided id/action query params, use those directly
  if (qId) {
    if (qAction === 'status') return handleStatus(req, res, qId);
    if (qAction === 'confirm') return handleConfirm(req, res, qId);
    if (qAction === 'cancel') return handleCancel(req, res, qId);
    return handleOrderDetail(req, res, qId);
  }

  // Fallback: catch-all path segments
  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : (rawPath ? rawPath.split('/') : []);

  // /api/orders/__root (rewritten from /api/orders)
  if (pathSegments[0] === '__root' || pathSegments.length === 0) {
    return handleOrdersRoot(req, res);
  }

  // /api/orders/[id]/confirm
  if (action === 'confirm') {
    return handleConfirm(req, res, orderId);
  }

  // /api/orders/[id]/cancel
  if (action === 'cancel') {
    return handleCancel(req, res, orderId);
  }

  // /api/orders/[id]/status
  if (action === 'status') {
    return handleStatus(req, res, orderId);
  }

  // /api/orders/[id]
  if (orderId) {
    return handleOrderDetail(req, res, orderId);
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

  // venue_id 優先、後方互換で store_id も受理
  const store_id = body.venue_id || body.store_id;
  const {
    order_type,
    items,
    member_id,
    brand_id,
    // SEC: stripe_account_id はクライアントから受け取らず、DBから取得する (03-P0-1)
    guest_name, guest_email, guest_phone,
    guest_address_prefecture, guest_address_city, guest_address_street, guest_address_building,
    delivery_address,
    points_used, aiden_points_used, normal_points_used,
    subtotal,
    customer_email, customer_name,
  } = body;

  if (!store_id || !order_type || !items || items.length === 0) {
    return error(res, 'venue_id, order_type, items は必須です');
  }

  // SEC: 数量バリデーション (03-P1-1)
  for (const item of items) {
    if (!item.quantity || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
      return error(res, '数量は1〜100の整数で指定してください');
    }
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

    // SEC: stripe_account_idをDBから取得 (03-P0-1)
    let stripe_account_id = null;
    if (store_id) {
      const { data: storeRow } = await supabase
        .from('venues')
        .select('brands(corp_id:merchant_id)')
        .eq('id', store_id)
        .single();
      if (storeRow?.brands?.corp_id) {
        const { data: corpRow } = await supabase
          .from('merchants')
          .select('stripe_account_id')
          .eq('id', storeRow.brands.corp_id)
          .single();
        stripe_account_id = corpRow?.stripe_account_id || null;
      }
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
      venue_id: store_id,
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

  // SEC: JWT認証を追加 (03-P0-2)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);

  const body = req.body || {};
  const {
    brand_id,
    customer_email, customer_name, payment_method_name,
    items,
  } = body;

  try {
    // 注文の存在確認 — 金額・ポイント情報はDBから取得（クライアント値を信頼しない）
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, store_id:venue_id, order_type, total_amount, payment_intent_id, member_id, aiden_points_used, normal_points_used')
      .eq('id', id)
      .single();

    if (orderErr || !order) return error(res, '注文が見つかりません', 404);

    // SEC: DBから値を取得（クライアント送信値を無視）(03-P0-2)
    const piId = order.payment_intent_id;
    const orderSubtotal = order.total_amount;
    const memberId = order.member_id;
    const points_used = (order.aiden_points_used || 0) + (order.normal_points_used || 0);

    let earnedPoints = 0;
    let reviewToken = null;

    // ===== ポイント消費トランザクション =====
    if (memberId && points_used > 0) {
      // SEC: ポイント残高をDBから取得 (03-P0-2)
      const { data: ptRows } = await supabase
        .from('point_transactions')
        .select('amount')
        .eq('member_id', memberId);
      const currentBalance = (ptRows || []).reduce((s, r) => s + (r.amount || 0), 0);

      if (currentBalance < points_used) {
        return error(res, 'ポイント残高が不足しています', 400);
      }

      await supabase.from('point_transactions').insert({
        member_id: memberId,
        amount: -(points_used),
        balance_after: currentBalance - points_used,
        source: 'normal',
        reason: '注文消費（' + piId + '）',
        order_id: order.id,
      });
    }

    // ===== ポイント付与（設定をDBから取得）=====
    // SEC: point_settings, member_rank_multi をクライアントから受け取らない (03-P0-2)
    if (memberId) {
      const { data: ps } = await supabase
        .from('point_settings')
        .select('*')
        .eq('venue_id', order.store_id)
        .single();

      if (ps && ps.enabled) {
        const baseAmount = orderSubtotal;
        earnedPoints = Math.floor(baseAmount / ps.earn_rate_unit) * ps.earn_rate_point;

        // ランク倍率をDBから取得
        const { data: memberRow } = await supabase
          .from('members')
          .select('current_rank_id')
          .eq('id', memberId)
          .single();

        if (memberRow?.current_rank_id) {
          const { data: rankRow } = await supabase
            .from('rank_settings')
            .select('benefit_point_multi')
            .eq('id', memberRow.current_rank_id)
            .single();
          const rankMulti = rankRow?.benefit_point_multi || 1;
          if (rankMulti > 1) {
            earnedPoints = Math.floor(earnedPoints * rankMulti);
          }
        }

        if (earnedPoints > 0) {
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + (ps.expiry_months || 12));

          // 現在残高を取得
          const { data: ptRows2 } = await supabase
            .from('point_transactions')
            .select('amount')
            .eq('member_id', memberId);
          const balanceNow = (ptRows2 || []).reduce((s, r) => s + (r.amount || 0), 0);

          await supabase.from('point_transactions').insert({
            member_id: memberId,
            brand_id: brand_id || null,
            amount: earnedPoints,
            balance_after: balanceNow + earnedPoints,
            source: 'normal',
            reason: '注文獲得（' + piId + '）',
            order_id: order.id,
            expires_at: expiresAt.toISOString(),
          });
        }
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
          .select('id, brand_id, rank_name, is_default, sort_order, cond_monthly_count, cond_total_spend, benefit_point_multi, benefit_birthday, benefit_other, icon')
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
        .select('id, brand_id, enabled, points_per_review, monthly_limit, review_link_expiry_days')
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
        total: order.total_amount,
        points_used: points_used,
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
  const store_id = req.query.venue_id || req.query.store_id;
  const { status, limit = 50, offset = 0 } = req.query;

  // SEC-1: 認証必須。store_id指定時はスタッフ権限も必要
  if (!auth) {
    return error(res, '認証が必要です', 401);
  }

  try {
    let query = supabase
      .from('orders')
      .select('id, store_id:venue_id, order_type, status, total_amount, tracking_token, created_at, customer_name, member_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (store_id) {
      // store_id指定時: スタッフ権限チェック
      const isStaff = await isStoreStaffMember(auth.user.id, store_id);
      if (!isStaff) {
        return error(res, 'この店舗の注文を閲覧する権限がありません', 403);
      }
      query = query.eq('venue_id', store_id);
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
      .select('id, display_id, store_id:venue_id, brand_id, member_id, order_type, status, total_amount, payment_intent_id, tracking_token, customer_name, customer_email, customer_phone, delivery_address, aiden_points_used, normal_points_used, created_at, updated_at, order_items(id, product_id, size_id, quantity, unit_price, subtotal)')
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
      .select('id, status, payment_intent_id, store_id:venue_id')
      .eq('id', id)
      .single();

    if (orderError || !order) return error(res, '注文が見つかりません', 404);

    // SEC-3: 店舗スタッフ権限チェック
    const isStaff = await isStoreStaffMember(auth.user.id, order.store_id);
    if (!isStaff) {
      return error(res, 'この注文をキャンセルする権限がありません', 403);
    }

    if (order.status === 'cancelled') return error(res, 'この注文は既にキャンセルされています');

    // IR-19: 楽観的ロックでステータス変更 + キャンセルの二重実行防止
    const { data: locked, error: lockError } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .neq('status', 'cancelled')
      .select('id, status, updated_at')
      .single();

    if (lockError) {
      if (lockError.code === 'PGRST116') {
        return error(res, 'この注文は既にキャンセルされています', 409);
      }
      return error(res, '更新に失敗しました: ' + lockError.message, 500);
    }

    // Stripe キャンセル/返金（DB更新後に実行 — 失敗しても注文はキャンセル済み）
    if (order.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);

        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.cancel(order.payment_intent_id);
        } else if (pi.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: order.payment_intent_id });
        }
      } catch (stripeErr) {
        console.error('Stripe cancel/refund error (order already cancelled):', stripeErr.message);
      }
    }

    const updated = locked;

    // SEC: audit_logsにキャンセル記録 (03-P1-4, 05-P1-4)
    try {
      await supabase.from('audit_logs').insert({
        action: 'order_cancelled',
        target_table: 'orders',
        target_id: id,
        details: { venue_id: order.store_id, payment_intent_id: order.payment_intent_id },
        user_email: auth.user.email || null,
      });
    } catch (_) { /* non-fatal */ }

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
      .select('id, status, payment_intent_id, total_amount, store_id:venue_id')
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

    // IR-17: 楽観的ロック — 旧ステータスとの一致を条件に更新
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('status', order.status)
      .select('id, status, total_amount, updated_at')
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return error(res, '他のオペレーターがステータスを変更しました。ページを更新してください。', 409);
      }
      return error(res, '更新に失敗しました: ' + updateError.message, 500);
    }

    // A-09: audit_logs に記録
    try {
      await supabase.from('audit_logs').insert({
        action: 'order_status_change',
        target_table: 'orders',
        target_id: id,
        details: { old_status: order.status, new_status: status, venue_id: order.store_id },
        user_email: auth.user.email || null,
      });
    } catch (_) { /* non-fatal */ }

    return ok(res, {
      ...updated,
      payment_captured: status === 'prepared',
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
