import { supabase } from '../_lib/supabase.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { authenticateRequest } from '../_lib/auth.js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Rate limiting: 5 requests per minute per IP
const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// System prompts
const MERCHANT_SYSTEM_PROMPT = `あなたはWeir（アイデン）のカスタマーサポートAIアシスタントです。
Weirは日本の飲食店向けオールインワンSaaSプラットフォームで、ブランドHP、モバイルオーダー、注文ダッシュボード、顧客管理、管理マスタを提供しています。

## 対応ルール
- 丁寧なビジネス敬語で対応してください
- ユーザーの言語（日本語/英語）を自動判定し、同じ言語で回答してください
- 景表法に抵触する表現（「最安」「No.1」「確実に売上が上がる」「保証」等）は絶対に使わないでください
- 不明な点は「確認いたします」と回答してください
- 簡潔に回答してください（200文字以内を目安）

## エスカレーション基準
以下の場合は回答の最後に [ESCALATE] タグを必ず付けてください:
- 契約変更・解約の要望
- 決済トラブル・返金要求
- バグ報告・技術的障害
- 回答に自信がない場合
- ユーザーが人間の対応を求めた場合

## 料金プラン
- STD: ¥0/月（無料枠あり）
- PRO: ¥4,980/月/店舗
- EXPERT: ¥9,800/月/店舗

## 手数料
- Dine-in: 3.8%
- Takeout/Delivery: 4.0%`;

const ENDUSER_SYSTEM_PROMPT = `あなたはWeir（アイデン）のカスタマーサポートAIアシスタントです。
飲食店のモバイルオーダーを利用するお客様からの質問にお答えします。

## 対応ルール
- フレンドリーでカジュアルなトーンで対応してください
- ユーザーの言語（日本語/英語）を自動判定し、同じ言語で回答してください
- 景表法に抵触する表現は使わないでください
- 簡潔に回答してください（150文字以内を目安）
- 解決できない場合は「support@weir.co.jp にお問い合わせください」と案内してください

## 対応範囲
- 注文方法・操作方法
- キャンセル・返金について
- ポイント・クーポンの使い方
- 配達状況の確認
- アレルギー・食材について（店舗の方針に基づいて回答）`;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : rawPath.split('/');

  try {
    if (pathSegments[0] === '__root' || pathSegments[0] === 'send') {
      return handleSend(req, res);
    }
    if (pathSegments[0] === 'feedback') {
      return handleFeedback(req, res);
    }
    if (pathSegments[0] === 'history') {
      return handleHistory(req, res);
    }
    if (pathSegments[0] === 'sessions') {
      return handleSessions(req, res);
    }
    if (pathSegments[0] === 'resolve') {
      return handleResolve(req, res);
    }
    if (pathSegments[0] === 'analytics') {
      return handleAnalytics(req, res);
    }
    if (pathSegments[0] === 'policies') {
      return handlePolicies(req, res);
    }
    return error(res, 'Not found', 404);
  } catch (err) {
    console.error('Chat API error:', err);
    return error(res, 'Internal server error', 500);
  }
}

// --- POST /api/chat/send ---
async function handleSend(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return error(res, 'リクエストが多すぎます。1分後に再度お試しください。', 429);
  }

  const {
    session_id,
    session_type,
    message,
    store_id,
    brand_id,
    customer_id,
    operator_id,
    guest_session_id,
  } = req.body || {};

  if (!message || !message.trim()) {
    return error(res, 'メッセージは必須です');
  }
  if (!session_id && !session_type) {
    return error(res, 'session_type は新規セッション作成時に必須です');
  }

  let currentSessionId = session_id;

  // 1. Create or get session
  if (!currentSessionId) {
    const sessionData = {
      session_type: session_type || 'enduser',
      venue_id: store_id || null,
      brand_id: brand_id || null,
      customer_id: customer_id || null,
      operator_id: operator_id || null,
      guest_session_id: guest_session_id || null,
      status: 'active',
    };

    // If store_id provided but no brand_id, fetch brand_id
    if (store_id && !brand_id) {
      const { data: store } = await supabase
        .from('venues')
        .select('brand_id')
        .eq('id', store_id)
        .single();
      if (store) sessionData.brand_id = store.brand_id;
    }

    const { data: session, error: sessErr } = await supabase
      .from('chat_sessions')
      .insert(sessionData)
      .select('id')
      .single();

    if (sessErr) {
      console.error('Session creation error:', sessErr);
      return error(res, 'セッション作成に失敗しました', 500);
    }
    currentSessionId = session.id;
  }

  // 2. Save user message
  const { error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      session_id: currentSessionId,
      role: 'user',
      content: message.trim(),
    });

  if (msgErr) {
    console.error('Message save error:', msgErr);
    return error(res, 'メッセージ保存に失敗しました', 500);
  }

  // 3. Get session info
  const { data: sessionInfo } = await supabase
    .from('chat_sessions')
    .select('session_type, store_id:venue_id, brand_id')
    .eq('id', currentSessionId)
    .single();

  const isMerchant = sessionInfo?.session_type === 'merchant';

  // 4. RAG: Get relevant FAQ/manual chunks
  let ragContext = '';
  try {
    ragContext = await getRagContext(message.trim());
  } catch (ragErr) {
    console.error('RAG error (non-fatal):', ragErr);
  }

  // 5. Get store policies
  let policiesContext = '';
  try {
    policiesContext = await getStorePolicies(sessionInfo?.store_id, sessionInfo?.brand_id);
  } catch (polErr) {
    console.error('Policies error (non-fatal):', polErr);
  }

  // 6. Get chat history (last 10 messages)
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', currentSessionId)
    .order('created_at', { ascending: true })
    .limit(10);

  // 7. Build system prompt
  let systemPrompt = isMerchant ? MERCHANT_SYSTEM_PROMPT : ENDUSER_SYSTEM_PROMPT;

  if (ragContext) {
    systemPrompt += `\n\n## 参考情報（FAQ/マニュアル）\n${ragContext}`;
  }
  if (policiesContext) {
    systemPrompt += `\n\n## この店舗の運営方針\n${policiesContext}`;
  }

  // 8. Call Claude API
  let aiResponse = '';
  let escalated = false;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const messages = (history || [])
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      temperature: 0.3,
      system: systemPrompt,
      messages,
    });

    aiResponse = response.content[0]?.text || 'すみません、回答を生成できませんでした。';

    // Check for escalation marker
    if (aiResponse.includes('[ESCALATE]')) {
      escalated = true;
      aiResponse = aiResponse.replace(/\s*\[ESCALATE\]\s*/g, '');

      if (isMerchant) {
        aiResponse += '\n\n担当者に確認いたします。しばらくお待ちください。';
      }
    }
  } catch (aiErr) {
    console.error('Claude API error:', aiErr);
    aiResponse = isMerchant
      ? '申し訳ございません。現在AIアシスタントに接続できません。support@weir.co.jp までお問い合わせください。'
      : '現在チャットが利用できません。support@weir.co.jp までお問い合わせください。';
  }

  // 9. Save assistant message
  const metadata = {};
  if (ragContext) metadata.rag_used = true;
  if (policiesContext) metadata.policies_used = true;
  if (escalated) metadata.escalate = true;

  const { data: savedMsg } = await supabase
    .from('chat_messages')
    .insert({
      session_id: currentSessionId,
      role: 'assistant',
      content: aiResponse,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    })
    .select('id')
    .single();

  // 10. Handle escalation
  if (escalated && isMerchant) {
    await supabase
      .from('chat_sessions')
      .update({ status: 'escalated', escalated_at: new Date().toISOString() })
      .eq('id', currentSessionId);

    // Trigger escalation email via Edge Function
    try {
      await triggerEscalationEmail(currentSessionId, sessionInfo);
    } catch (emailErr) {
      console.error('Escalation email error (non-fatal):', emailErr);
    }
  }

  // 11. Log to ai_interactions (if table exists)
  try {
    await supabase.from('ai_interactions').insert({
      interaction_type: isMerchant ? 'cs_chat_merchant' : 'cs_chat_enduser',
      venue_id: sessionInfo?.store_id,
      brand_id: sessionInfo?.brand_id,
      customer_id: sessionInfo?.customer_id || null,
      input_text: message.trim().substring(0, 500),
      output_text: aiResponse.substring(0, 500),
      model: 'claude-sonnet-4-20250514',
      tokens_used: null,
    });
  } catch (logErr) {
    // Non-fatal: ai_interactions table may not exist
  }

  return ok(res, {
    session_id: currentSessionId,
    message: {
      id: savedMsg?.id,
      role: 'assistant',
      content: aiResponse,
    },
    escalated,
  });
}

// --- RAG: Vector similarity search ---
async function getRagContext(query) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return '';

  const openai = new OpenAI({ apiKey: openaiKey });

  // Generate embedding for the query
  const embResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  const queryEmbedding = embResponse.data[0].embedding;

  // Search for similar chunks using pgvector
  const { data: chunks, error: searchErr } = await supabase.rpc('match_faq_embeddings', {
    query_embedding: queryEmbedding,
    match_threshold: 0.3,
    match_count: 5,
  });

  if (searchErr || !chunks || chunks.length === 0) {
    // Fallback: no vector search available, return empty
    return '';
  }

  return chunks.map(c => c.chunk_text).join('\n\n---\n\n');
}

// --- Get store policies with fallback ---
async function getStorePolicies(storeId, brandId) {
  if (!storeId && !brandId) return '';

  let policies = [];

  if (storeId) {
    // Get store-level policies
    const { data: storePolicies } = await supabase
      .from('venue_policies')
      .select('policy_type, content')
      .eq('venue_id', storeId);

    if (storePolicies) policies = storePolicies;
  }

  if (brandId) {
    // Get brand-level policies (fallback for missing policy_types)
    const { data: brandPolicies } = await supabase
      .from('venue_policies')
      .select('policy_type, content')
      .eq('brand_id', brandId)
      .is('venue_id', null);

    if (brandPolicies) {
      const existingTypes = new Set(policies.map(p => p.policy_type));
      for (const bp of brandPolicies) {
        if (!existingTypes.has(bp.policy_type)) {
          policies.push(bp);
        }
      }
    }
  }

  if (policies.length === 0) return '';

  const typeLabels = {
    refund: '返金ポリシー',
    allergen: 'アレルギー対応',
    business_hours: '営業時間',
    takeout_delivery: 'テイクアウト/デリバリー',
    points_coupons: 'ポイント/クーポン',
    other: 'その他',
  };

  return policies
    .map(p => `【${typeLabels[p.policy_type] || p.policy_type}】\n${p.content}`)
    .join('\n\n');
}

// --- Trigger escalation email ---
async function triggerEscalationEmail(sessionId, sessionInfo) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Get last 3 messages for summary
  const { data: recentMsgs } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(3);

  // Get store name
  let storeName = '不明';
  if (sessionInfo?.store_id) {
    const { data: store } = await supabase
      .from('venues')
      .select('name')
      .eq('id', sessionInfo.store_id)
      .single();
    if (store) storeName = store.name;
  }

  await fetch(`${supabaseUrl}/functions/v1/send-escalation-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      store_name: storeName,
      session_type: sessionInfo?.session_type,
      recent_messages: recentMsgs || [],
    }),
  });
}

// --- POST /api/chat/feedback ---
async function handleFeedback(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  // SEC: 認証チェック (04-P1-5)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);

  const { message_id, feedback } = req.body || {};

  if (!message_id || !feedback) {
    return error(res, 'message_id と feedback は必須です');
  }
  if (!['helpful', 'not_helpful'].includes(feedback)) {
    return error(res, 'feedback は helpful または not_helpful です');
  }

  const { error: updateErr } = await supabase
    .from('chat_messages')
    .update({ feedback })
    .eq('id', message_id);

  if (updateErr) {
    return error(res, 'フィードバック更新に失敗しました', 500);
  }

  return ok(res, { success: true });
}

// --- GET /api/chat/history ---
async function handleHistory(req, res) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  // SEC: 認証チェック (04-P1-5)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);

  const sessionId = req.query.session_id;
  if (!sessionId) return error(res, 'session_id は必須です');

  const { data: messages, error: fetchErr } = await supabase
    .from('chat_messages')
    .select('id, role, content, feedback, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (fetchErr) {
    return error(res, 'チャット履歴の取得に失敗しました', 500);
  }

  return ok(res, { messages: messages || [] });
}

// --- GET /api/chat/sessions (admin) ---
async function handleSessions(req, res) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  // SEC: 認証 + staffロールチェック (04-P1-4)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);
  const { data: ws } = await supabase.from('weir_staff').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
  let staff = ws;
  if (!staff || staff.length === 0) {
    const { data: ma } = await supabase.from('merchant_accounts').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
    staff = ma;
  }
  if (!staff || staff.length === 0) return error(res, 'スタッフ権限が必要です', 403);

  const {
    status: filterStatus,
    session_type: filterType,
    store_id: filterStore,
    brand_id: filterBrand,
    limit: limitParam,
    offset: offsetParam,
  } = req.query;

  let query = supabase
    .from('chat_sessions')
    .select(`
      id, session_type, store_id:venue_id, brand_id, customer_id, operator_id,
      guest_session_id, status, escalated_at, resolved_at, created_at, updated_at
    `)
    .order('created_at', { ascending: false })
    .limit(parseInt(limitParam) || 50);

  if (filterStatus) query = query.eq('status', filterStatus);
  if (filterType) query = query.eq('session_type', filterType);
  if (filterStore) query = query.eq('venue_id', filterStore);
  if (filterBrand) query = query.eq('brand_id', filterBrand);
  if (offsetParam) query = query.range(parseInt(offsetParam), parseInt(offsetParam) + (parseInt(limitParam) || 50) - 1);

  const { data: sessions, error: fetchErr } = await query;

  if (fetchErr) {
    return error(res, 'セッション一覧の取得に失敗しました', 500);
  }

  // Get last message preview for each session
  const sessionsWithPreview = await Promise.all(
    (sessions || []).map(async (s) => {
      const { data: lastMsg } = await supabase
        .from('chat_messages')
        .select('content, role, created_at')
        .eq('session_id', s.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Get store name
      let store_name = null;
      if (s.store_id) {
        const { data: store } = await supabase
          .from('venues')
          .select('name')
          .eq('id', s.store_id)
          .single();
        store_name = store?.name;
      }

      return {
        ...s,
        store_name,
        last_message: lastMsg ? {
          content: lastMsg.content.substring(0, 100),
          role: lastMsg.role,
          created_at: lastMsg.created_at,
        } : null,
      };
    })
  );

  return ok(res, { sessions: sessionsWithPreview });
}

// --- POST /api/chat/resolve (admin) ---
async function handleResolve(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  // SEC: 認証 + staffロールチェック (04-P1-4)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);
  const { data: ws } = await supabase.from('weir_staff').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
  let staff = ws;
  if (!staff || staff.length === 0) {
    const { data: ma } = await supabase.from('merchant_accounts').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
    staff = ma;
  }
  if (!staff || staff.length === 0) return error(res, 'スタッフ権限が必要です', 403);

  const { session_id } = req.body || {};
  if (!session_id) return error(res, 'session_id は必須です');

  const { error: updateErr } = await supabase
    .from('chat_sessions')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', session_id);

  if (updateErr) {
    return error(res, 'セッション解決に失敗しました', 500);
  }

  return ok(res, { success: true });
}

// --- GET /api/chat/analytics (admin) ---
async function handleAnalytics(req, res) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  // SEC: 認証 + staffロールチェック (04-P1-4)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);
  const { data: ws } = await supabase.from('weir_staff').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
  let staff = ws;
  if (!staff || staff.length === 0) {
    const { data: ma } = await supabase.from('merchant_accounts').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
    staff = ma;
  }
  if (!staff || staff.length === 0) return error(res, 'スタッフ権限が必要です', 403);

  const { store_id, brand_id, period } = req.query;
  const days = period === 'month' ? 30 : period === 'week' ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Total sessions
  let sessQuery = supabase
    .from('chat_sessions')
    .select('id, session_type, status, created_at', { count: 'exact' })
    .gte('created_at', since);

  if (store_id) sessQuery = sessQuery.eq('venue_id', store_id);
  if (brand_id) sessQuery = sessQuery.eq('brand_id', brand_id);

  const { data: sessions, count: totalSessions } = await sessQuery;

  // Escalated count
  const escalatedCount = (sessions || []).filter(s => s.status === 'escalated').length;
  const resolvedCount = (sessions || []).filter(s => s.status === 'resolved').length;

  // Feedback stats
  let fbQuery = supabase
    .from('chat_messages')
    .select('feedback')
    .not('feedback', 'is', null)
    .gte('created_at', since);

  const { data: feedbacks } = await fbQuery;
  const helpfulCount = (feedbacks || []).filter(f => f.feedback === 'helpful').length;
  const notHelpfulCount = (feedbacks || []).filter(f => f.feedback === 'not_helpful').length;

  // Daily breakdown
  const dailyCounts = {};
  for (const s of (sessions || [])) {
    const day = s.created_at.substring(0, 10);
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  }

  return ok(res, {
    period: { days, since },
    total_sessions: totalSessions || 0,
    escalated_count: escalatedCount,
    resolved_count: resolvedCount,
    escalation_rate: totalSessions ? (escalatedCount / totalSessions * 100).toFixed(1) : '0.0',
    feedback: {
      helpful: helpfulCount,
      not_helpful: notHelpfulCount,
      total: helpfulCount + notHelpfulCount,
      helpful_rate: (helpfulCount + notHelpfulCount) > 0
        ? (helpfulCount / (helpfulCount + notHelpfulCount) * 100).toFixed(1)
        : '0.0',
    },
    daily: dailyCounts,
  });
}

// --- GET/POST /api/chat/policies ---
async function handlePolicies(req, res) {
  // SEC: 認証 + staffロールチェック (04-P1-4)
  const auth = await authenticateRequest(req);
  if (!auth) return error(res, '認証が必要です', 401);
  const { data: ws } = await supabase.from('weir_staff').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
  let staff = ws;
  if (!staff || staff.length === 0) {
    const { data: ma } = await supabase.from('merchant_accounts').select('id').eq('user_id', auth.user.id).eq('status','active').limit(1);
    staff = ma;
  }
  if (!staff || staff.length === 0) return error(res, 'スタッフ権限が必要です', 403);

  if (req.method === 'GET') {
    const { store_id, brand_id } = req.query;

    let query = supabase
      .from('venue_policies')
      .select('id, store_id:venue_id, brand_id, policy_type, content, created_at, updated_at')
      .order('policy_type');

    if (store_id) query = query.eq('venue_id', store_id);
    if (brand_id) query = query.eq('brand_id', brand_id);

    const { data, error: fetchErr } = await query;
    if (fetchErr) return error(res, 'ポリシー取得に失敗しました', 500);
    return ok(res, { policies: data || [] });
  }

  if (req.method === 'POST') {
    const { id, store_id, brand_id, policy_type, content } = req.body || {};

    if (!policy_type || !content) {
      return error(res, 'policy_type と content は必須です');
    }
    if (!store_id && !brand_id) {
      return error(res, 'store_id または brand_id は必須です');
    }

    if (id) {
      // Update existing
      const { error: updateErr } = await supabase
        .from('venue_policies')
        .update({ content, policy_type, venue_id: store_id, brand_id })
        .eq('id', id);
      if (updateErr) return error(res, 'ポリシー更新に失敗しました', 500);
    } else {
      // Insert new
      const { error: insertErr } = await supabase
        .from('venue_policies')
        .insert({ venue_id: store_id, brand_id, policy_type, content });
      if (insertErr) return error(res, 'ポリシー作成に失敗しました', 500);
    }

    return ok(res, { success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return error(res, 'id は必須です');

    const { error: delErr } = await supabase
      .from('venue_policies')
      .delete()
      .eq('id', id);

    if (delErr) return error(res, 'ポリシー削除に失敗しました', 500);
    return ok(res, { success: true });
  }

  return error(res, 'Method not allowed', 405);
}
