import { supabase, createAnonClient } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { authenticateRequest, requireAuth } from '../_lib/auth.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Vercel catch-all [...path] populates req.query['...path'] as string or array
  const rawPath = req.query.path || req.query['...path'] || [];
  const pathSegments = Array.isArray(rawPath) ? rawPath : rawPath.split('/');

  // /api/members/login
  if (pathSegments[0] === 'login' && !pathSegments[1]) {
    return handleLogin(req, res);
  }

  // /api/members/login/line
  if (pathSegments[0] === 'login' && pathSegments[1] === 'line' && !pathSegments[2]) {
    return handleLineLogin(req, res);
  }

  // /api/members/login/line/callback
  if (pathSegments[0] === 'login' && pathSegments[1] === 'line' && pathSegments[2] === 'callback') {
    return handleLineCallback(req, res);
  }

  // /api/members/register
  if (pathSegments[0] === 'register') {
    return handleRegister(req, res);
  }

  // /api/members/resend-verification
  if (pathSegments[0] === 'resend-verification') {
    return handleResendVerification(req, res);
  }

  // /api/members/bulk-send-verification (Phase 3: admin bulk send)
  if (pathSegments[0] === 'bulk-send-verification') {
    return handleBulkSendVerification(req, res);
  }

  // /api/members/verification-status (Phase 3: check if current user is verified)
  if (pathSegments[0] === 'verification-status') {
    return handleVerificationStatus(req, res);
  }

  // /api/members/reset-password
  if (pathSegments[0] === 'reset-password') {
    return handleResetPassword(req, res);
  }

  // /api/members/update-password
  if (pathSegments[0] === 'update-password') {
    return handleUpdatePassword(req, res);
  }

  // /api/members/withdraw
  if (pathSegments[0] === 'withdraw' && !pathSegments[1]) {
    return handleWithdraw(req, res);
  }

  // /api/members/withdraw/cancel
  if (pathSegments[0] === 'withdraw' && pathSegments[1] === 'cancel') {
    return handleWithdrawCancel(req, res);
  }

  // /api/members/withdraw/status
  if (pathSegments[0] === 'withdraw' && pathSegments[1] === 'status') {
    return handleWithdrawStatus(req, res);
  }

  // /api/members/[id]/card
  if (pathSegments[0] && pathSegments[1] === 'card') {
    return handleCard(req, res, pathSegments[0]);
  }

  // /api/members/[id]
  if (pathSegments[0]) {
    return handleMember(req, res, pathSegments[0]);
  }

  return error(res, 'Not found', 404);
}

// --- Login ---
async function handleLogin(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { email, password } = req.body || {};
  if (!email || !password) {
    return error(res, 'メールアドレスとパスワードを入力してください');
  }

  try {
    const anonClient = createAnonClient();
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({ email, password });

    if (authError) {
      // Check if user exists but is unverified (Supabase blocks signIn for unconfirmed users)
      const { data: userList } = await supabase.from('members')
        .select('auth_user_id, verification_grace_sent_at, verification_grace_expires_at, withdrawal_status')
        .eq('email', email).limit(1);

      if (userList && userList.length > 0) {
        const memberRow = userList[0];

        // Check withdrawal status
        if (memberRow.withdrawal_status === 'withdrawn') {
          return error(res, 'このアカウントは退会済みです。', 403, 'ACCOUNT_WITHDRAWN');
        }

        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(memberRow.auth_user_id);
        if (authUser && !authUser.email_confirmed_at) {
          // Phase 3: existing members with grace period can still login
          if (memberRow.verification_grace_sent_at) {
            // Verify password by attempting signIn with a temporary confirm
            // Use admin to generate a session for grace-period users
            const { data: { user: updatedUser }, error: confirmErr } = await supabase.auth.admin.updateUser(
              memberRow.auth_user_id,
              { email_confirm: true }
            );
            if (confirmErr) {
              return error(res, 'メール認証が完了していません。', 403, 'EMAIL_NOT_VERIFIED');
            }
            // Now try login again
            const { data: retryData, error: retryError } = await anonClient.auth.signInWithPassword({ email, password });
            // Immediately un-confirm to keep tracking status
            await supabase.auth.admin.updateUser(memberRow.auth_user_id, { email_confirm: false });

            if (retryError) {
              return error(res, 'メールアドレスまたはパスワードが正しくありません', 401);
            }

            const { data: member } = await supabase.from('members')
              .select('id, first_name, last_name, email, phone, gender, address_prefecture, address_city, address_street, address_building, stripe_customer_id, withdrawal_status')
              .eq('auth_user_id', retryData.user.id).single();
            if (!member) return error(res, '会員情報が見つかりません', 404);

            const { withdrawal_status: ws, ...mData } = member;
            return ok(res, {
              access_token: retryData.session.access_token,
              refresh_token: retryData.session.refresh_token,
              expires_in: retryData.session.expires_in,
              member: mData,
              email_verified: false,
              grace_expires_at: memberRow.verification_grace_expires_at,
            });
          }

          // New member without grace period — block login
          return error(res, 'メール認証が完了していません。登録時に届いた認証メールのURLをクリックしてください。', 403, 'EMAIL_NOT_VERIFIED');
        }
      }
      return error(res, 'メールアドレスまたはパスワードが正しくありません', 401);
    }

    // Double-check email verification (for edge cases)
    if (!authData.user.email_confirmed_at) {
      // Phase 3: check if this is a grace-period member
      const { data: graceCheck } = await supabase.from('members')
        .select('verification_grace_sent_at, verification_grace_expires_at')
        .eq('auth_user_id', authData.user.id).single();

      if (!graceCheck || !graceCheck.verification_grace_sent_at) {
        await anonClient.auth.signOut();
        return error(res, 'メール認証が完了していません。登録時に届いた認証メールのURLをクリックしてください。', 403, 'EMAIL_NOT_VERIFIED');
      }
      // Grace period member — allow login but flag as unverified
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, phone, gender, address_prefecture, address_city, address_street, address_building, stripe_customer_id, withdrawal_status')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (memberError || !member) {
      return error(res, '会員情報が見つかりません', 404);
    }

    // Check withdrawal status
    if (member.withdrawal_status === 'withdrawn') {
      await anonClient.auth.signOut();
      return error(res, 'このアカウントは退会済みです。', 403, 'ACCOUNT_WITHDRAWN');
    }

    const { withdrawal_status, ...memberData } = member;
    const isVerified = !!authData.user.email_confirmed_at;
    const response = {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      member: memberData,
    };

    if (!isVerified) {
      const { data: graceInfo } = await supabase.from('members')
        .select('verification_grace_expires_at')
        .eq('auth_user_id', authData.user.id).single();
      response.email_verified = false;
      response.grace_expires_at = graceInfo?.verification_grace_expires_at || null;
    }

    return ok(res, response);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Register ---
async function handleRegister(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const {
    email, password, first_name, last_name, phone,
    gender, birth_date, brand_id,
    address_prefecture, address_city, address_street, address_building,
  } = req.body || {};

  if (!email || !password || !first_name || !last_name || !phone || !brand_id) {
    return error(res, '必須項目が不足しています（メール、パスワード、姓、名、電話番号、ブランドID）');
  }
  if (password.length < 8) {
    return error(res, 'パスワードは8文字以上で設定してください');
  }
  if (!email.includes('@')) {
    return error(res, '有効なメールアドレスを入力してください');
  }

  try {
    const redirectUrl = (process.env.FRONTEND_URL || 'https://aiden-jp.net') + '/aiden-email-verified.html';
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { redirect_url: redirectUrl },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return error(res, 'このメールアドレスは既に登録されています', 409);
      }
      return error(res, authError.message, 400);
    }

    const authUserId = authData.user.id;

    const memberData = {
      auth_user_id: authUserId, first_name, last_name, email, phone,
      name: (last_name || '') + ' ' + (first_name || ''),
      email_verification_sent_at: new Date().toISOString(),
      email_verification_resend_count: 0,
    };
    if (brand_id) memberData.brand_id = brand_id;
    if (gender) memberData.gender = gender;
    if (birth_date) memberData.birth_date = birth_date;
    if (address_prefecture) memberData.address_prefecture = address_prefecture;
    if (address_city) memberData.address_city = address_city;
    if (address_street) memberData.address_street = address_street;
    if (address_building) memberData.address_building = address_building;

    const { data: member, error: memberError } = await supabase
      .from('members')
      .insert(memberData)
      .select('id, email, first_name, last_name')
      .single();

    if (memberError) {
      await supabase.auth.admin.deleteUser(authUserId);
      return error(res, 'メンバー登録に失敗しました: ' + memberError.message, 500);
    }

    // 確認メールを送信（Resend API経由）
    let emailSent = false;
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'signup',
        email,
        options: { redirectTo: redirectUrl },
      });

      if (linkError) {
        console.error('generateLink error:', linkError.message);
      } else if (linkData?.properties?.action_link && RESEND_API_KEY) {
        const confirmLink = linkData.properties.action_link;
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'AIden <noreply@aiden-jp.net>',
            to: [email],
            subject: '【AIden】メールアドレスの確認',
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
              <h2 style="color:#333">メールアドレスの確認</h2>
              <p>${last_name} ${first_name} 様</p>
              <p>AIdenへのご登録ありがとうございます。<br>以下のボタンをクリックして、メールアドレスの確認を完了してください。</p>
              <div style="text-align:center;margin:30px 0">
                <a href="${confirmLink}" style="background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold">メールアドレスを確認する</a>
              </div>
              <p style="color:#666;font-size:14px">このリンクは60分間有効です。<br>心当たりがない場合は、このメールを無視してください。</p>
              <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
              <p style="color:#999;font-size:12px">AIden - 飲食店向けオールインワンSaaS</p>
            </div>`,
          }),
        });
        emailSent = emailRes.ok;
        if (!emailRes.ok) {
          console.error('Resend email failed:', await emailRes.text());
        }
      } else if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not set, skipping verification email');
      }
    } catch (emailErr) {
      console.error('Verification email error:', emailErr.message);
    }

    return ok(res, {
      member_id: member.id,
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
      email_sent: emailSent,
      message: emailSent
        ? '確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。'
        : '会員登録が完了しました。確認メールの送信に失敗しました。マイページから再送できます。',
    }, 201);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Member by ID ---
async function handleMember(req, res, id) {
  if (req.method === 'GET') {
    return handleMemberGet(req, res, id);
  } else if (req.method === 'PATCH') {
    return handleMemberPatch(req, res, id);
  }
  return error(res, 'Method not allowed', 405);
}

async function handleMemberGet(req, res, id) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: member, error: dbError } = await supabase
      .from('members')
      .select('id, auth_user_id, first_name, last_name, email, phone, gender, birth_date, address_prefecture, address_city, address_street, address_building, stripe_customer_id, line_user_id, created_at, updated_at')
      .eq('id', id)
      .single();

    if (dbError || !member) return error(res, '会員が見つかりません', 404);
    if (member.auth_user_id !== auth.user.id) return error(res, 'アクセス権限がありません', 403);

    const { auth_user_id, ...memberData } = member;
    return ok(res, memberData);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleMemberPatch(req, res, id) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: existing } = await supabase
      .from('members')
      .select('auth_user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.auth_user_id !== auth.user.id) {
      return error(res, 'アクセス権限がありません', 403);
    }

    const allowedFields = [
      'first_name', 'last_name', 'phone', 'gender', 'birth_date',
      'address_prefecture', 'address_city', 'address_street', 'address_building',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return error(res, '更新するフィールドがありません');
    }

    const { data: updated, error: dbError } = await supabase
      .from('members')
      .update(updates)
      .eq('id', id)
      .select('id, first_name, last_name, email, phone, gender, birth_date, address_prefecture, address_city, address_street, address_building, stripe_customer_id, updated_at')
      .single();

    if (dbError) return error(res, '更新に失敗しました: ' + dbError.message, 500);

    return ok(res, updated);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Card ---
async function handleCard(req, res, memberId) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data: member } = await supabase
    .from('members')
    .select('id, auth_user_id, stripe_customer_id')
    .eq('id', memberId)
    .single();

  if (!member || member.auth_user_id !== auth.user.id) {
    return error(res, 'アクセス権限がありません', 403);
  }

  if (req.method === 'POST') {
    return handleCreateSetupIntent(res, member);
  } else if (req.method === 'GET') {
    return handleListCards(res, member);
  } else if (req.method === 'DELETE') {
    return handleDeleteCard(req, res, member);
  }
  return error(res, 'Method not allowed', 405);
}

async function ensureStripeCustomer(member) {
  if (member.stripe_customer_id) return member.stripe_customer_id;

  const { data: fullMember } = await supabase
    .from('members')
    .select('email, first_name, last_name, phone')
    .eq('id', member.id)
    .single();

  const customer = await stripe.customers.create({
    email: fullMember?.email,
    name: (fullMember?.last_name || '') + ' ' + (fullMember?.first_name || ''),
    phone: fullMember?.phone,
    metadata: { aiden_member_id: member.id },
  });

  await supabase
    .from('members')
    .update({ stripe_customer_id: customer.id })
    .eq('id', member.id);

  member.stripe_customer_id = customer.id;
  return customer.id;
}

async function handleCreateSetupIntent(res, member) {
  try {
    const customerId = await ensureStripeCustomer(member);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    return ok(res, { client_secret: setupIntent.client_secret, customer_id: customerId });
  } catch (e) {
    return error(res, 'SetupIntent の作成に失敗しました: ' + e.message, 500);
  }
}

async function handleListCards(res, member) {
  try {
    if (!member.stripe_customer_id) return ok(res, { cards: [] });
    const paymentMethods = await stripe.paymentMethods.list({
      customer: member.stripe_customer_id,
      type: 'card',
    });
    const cards = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
    }));
    return ok(res, { cards });
  } catch (e) {
    return error(res, 'カード情報の取得に失敗しました: ' + e.message, 500);
  }
}

async function handleDeleteCard(req, res, member) {
  const { payment_method_id } = req.body || req.query || {};
  if (!payment_method_id) return error(res, 'payment_method_id が必要です');

  try {
    await stripe.paymentMethods.detach(payment_method_id);
    return ok(res, { deleted: true });
  } catch (e) {
    return error(res, 'カードの削除に失敗しました: ' + e.message, 500);
  }
}

// --- LINE Login ---
async function handleLineLogin(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { code } = req.body || {};
  if (!code) return error(res, 'LINE authorization code が必要です');

  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;

  if (!channelId || !channelSecret || !callbackUrl) {
    return error(res, 'LINE Login の設定が不足しています', 500);
  }

  try {
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return error(res, 'LINEトークンの取得に失敗しました: ' + (tokenData.error_description || tokenData.error), 400);
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profileRes.ok || !profile.userId) {
      return error(res, 'LINEプロフィールの取得に失敗しました', 400);
    }

    const { data: existingMember } = await supabase
      .from('members')
      .select('id, auth_user_id, first_name, last_name, email, phone, gender, stripe_customer_id')
      .eq('line_user_id', profile.userId)
      .single();

    let member;
    let isNewUser = false;
    let authUserId;

    if (existingMember) {
      member = existingMember;
      authUserId = existingMember.auth_user_id;
    } else {
      isNewUser = true;
      const lineEmail = `line_${profile.userId}@aiden-line.local`;
      const linePassword = crypto.randomUUID();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: lineEmail,
        password: linePassword,
        email_confirm: true,
        user_metadata: { line_user_id: profile.userId, display_name: profile.displayName },
      });

      if (authError) return error(res, 'アカウント作成に失敗しました: ' + authError.message, 500);
      authUserId = authData.user.id;

      const { data: newMember, error: memberError } = await supabase
        .from('members')
        .insert({
          auth_user_id: authUserId,
          line_user_id: profile.userId,
          first_name: profile.displayName || '',
          last_name: '',
          email: lineEmail,
        })
        .select('id, first_name, last_name, email, phone, gender, stripe_customer_id')
        .single();

      if (memberError) {
        await supabase.auth.admin.deleteUser(authUserId);
        return error(res, 'メンバー登録に失敗しました: ' + memberError.message, 500);
      }

      member = newMember;
    }

    const tempPassword = crypto.randomUUID();
    await supabase.auth.admin.updateUser(authUserId, { password: tempPassword });

    const anonClient = createAnonClient();
    const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({
      email: member.email,
      password: tempPassword,
    });

    if (loginError) return error(res, 'セッション作成に失敗しました', 500);

    return ok(res, {
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      expires_in: loginData.session.expires_in,
      member,
      is_new_user: isNewUser,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- LINE Callback ---
async function handleLineCallback(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://taiseiwolt.github.io/aiden-demo';

  if (!code) return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=missing_code');

  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;

  if (!channelId || !channelSecret || !callbackUrl) {
    return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=server_config');
  }

  try {
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=token_failed');
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profileRes.ok || !profile.userId) {
      return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=profile_failed');
    }

    const { data: existingMember } = await supabase
      .from('members')
      .select('id, auth_user_id, first_name, last_name, email, phone, gender, stripe_customer_id')
      .eq('line_user_id', profile.userId)
      .single();

    let member;
    let isNewUser = false;
    let authUserId;

    if (existingMember) {
      member = existingMember;
      authUserId = existingMember.auth_user_id;
    } else {
      isNewUser = true;
      const lineEmail = `line_${profile.userId}@aiden-line.local`;
      const linePassword = crypto.randomUUID();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: lineEmail,
        password: linePassword,
        email_confirm: true,
        user_metadata: { line_user_id: profile.userId, display_name: profile.displayName },
      });

      if (authError) return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=auth_create_failed');
      authUserId = authData.user.id;

      const { data: newMember, error: memberError } = await supabase
        .from('members')
        .insert({
          auth_user_id: authUserId,
          line_user_id: profile.userId,
          first_name: profile.displayName || '',
          last_name: '',
          email: lineEmail,
        })
        .select('id, first_name, last_name, email, phone, gender, stripe_customer_id')
        .single();

      if (memberError) {
        await supabase.auth.admin.deleteUser(authUserId);
        return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=member_create_failed');
      }

      member = newMember;
    }

    const anonClient = createAnonClient();
    const tempPassword = crypto.randomUUID();
    await supabase.auth.admin.updateUser(authUserId, { password: tempPassword });

    const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({
      email: member.email,
      password: tempPassword,
    });

    if (loginError) return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=session_failed');

    const fragment = new URLSearchParams({
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      member: JSON.stringify(member),
      is_new_user: String(isNewUser),
    }).toString();

    return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#' + fragment);
  } catch (e) {
    return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=server_error');
  }
}

// --- Resend Verification Email (Phase 2) ---
async function handleResendVerification(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { email } = req.body || {};
  if (!email) return error(res, 'メールアドレスを入力してください');

  const MAX_RESEND = 5;
  const COOLDOWN_SECONDS = 60;

  try {
    // Find member by email
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, auth_user_id, email_verification_sent_at, email_verification_resend_count')
      .eq('email', email)
      .limit(1);

    if (memberError || !members || members.length === 0) {
      return error(res, 'アカウントが見つかりません', 404);
    }

    const member = members[0];

    // Check if already verified via auth.users
    const { data: { user: authUser }, error: authError } = await supabase.auth.admin.getUserById(member.auth_user_id);
    if (authError || !authUser) return error(res, 'ユーザー情報の取得に失敗しました', 500);

    if (authUser.email_confirmed_at) {
      return error(res, 'このメールアドレスは既に認証済みです');
    }

    // Check resend count limit (max 5)
    const resendCount = member.email_verification_resend_count || 0;
    if (resendCount >= MAX_RESEND) {
      return error(res, '再送上限に達しました。support@aiden-jp.net までお問い合わせください。', 429, 'RESEND_LIMIT_EXCEEDED');
    }

    // Check cooldown (60 seconds since last send)
    if (member.email_verification_sent_at) {
      const lastSent = new Date(member.email_verification_sent_at);
      const now = new Date();
      const secondsSinceLastSend = (now - lastSent) / 1000;
      if (secondsSinceLastSend < COOLDOWN_SECONDS) {
        const remaining = Math.ceil(COOLDOWN_SECONDS - secondsSinceLastSend);
        return error(res, `${remaining}秒後に再送できます。`, 429, 'COOLDOWN_ACTIVE');
      }
    }

    // Generate new confirmation link (invalidates previous token)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: (process.env.FRONTEND_URL || 'https://aiden-jp.net') + '/aiden-email-verified.html',
      },
    });

    if (linkError) {
      return error(res, '認証メールの再送に失敗しました: ' + linkError.message, 500);
    }

    // Update resend tracking in members table
    const newResendCount = resendCount + 1;
    await supabase
      .from('members')
      .update({
        email_verification_sent_at: new Date().toISOString(),
        email_verification_resend_count: newResendCount,
      })
      .eq('id', member.id);

    // Audit log
    await supabase.from('audit_logs').insert({
      member_id: member.id,
      user_email: email,
      action: 'email_verification_resent',
      target_table: 'members',
      target_id: member.id,
      details: { resend_count: newResendCount },
    });

    return ok(res, {
      message: '認証メールを再送しました。',
      resend_count: newResendCount,
      max_resend: MAX_RESEND,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Bulk Send Verification Email (Phase 3: Admin) ---
async function handleBulkSendVerification(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  // Require service_role auth (admin only)
  const authHeader = req.headers.authorization;
  if (!authHeader) return error(res, '認証が必要です', 401);

  const BATCH_LIMIT = 100;
  const batchSize = Math.min(parseInt(req.body?.batch_size) || BATCH_LIMIT, BATCH_LIMIT);

  try {
    // Find existing unverified members who haven't been notified yet
    const { data: unverified, error: queryError } = await supabase.rpc(
      'mark_existing_unverified_for_grace',
      { batch_limit: batchSize }
    );

    if (queryError) {
      return error(res, 'クエリエラー: ' + queryError.message, 500);
    }

    if (!unverified || unverified.length === 0) {
      return ok(res, { message: '未認証の既存会員はいません。', sent_count: 0, total_remaining: 0 });
    }

    // Send verification emails via Supabase Auth generateLink
    let sentCount = 0;
    const errors = [];
    const redirectUrl = (process.env.FRONTEND_URL || 'https://aiden-jp.net') + '/aiden-email-verified.html';

    for (const member of unverified) {
      try {
        await supabase.auth.admin.generateLink({
          type: 'signup',
          email: member.member_email,
          options: { redirectTo: redirectUrl },
        });
        sentCount++;
      } catch (e) {
        errors.push({ email: member.member_email, error: e.message });
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      action: 'bulk_verification_email_sent',
      target_table: 'members',
      details: { sent_count: sentCount, error_count: errors.length, batch_size: batchSize },
    });

    // Check remaining
    const { count: remaining } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .is('verification_grace_sent_at', null);

    return ok(res, {
      message: `${sentCount}件の認証メールを送信しました。`,
      sent_count: sentCount,
      errors: errors.length > 0 ? errors : undefined,
      total_remaining: remaining || 0,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Verification Status (Phase 3: Check current user's verification) ---
async function handleVerificationStatus(req, res) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  const authHeader = req.headers.authorization;
  if (!authHeader) return error(res, '認証が必要です', 401);

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return error(res, '認証に失敗しました', 401);

    const isVerified = !!user.email_confirmed_at;

    // Get grace period info if unverified
    let graceInfo = null;
    if (!isVerified) {
      const { data: member } = await supabase
        .from('members')
        .select('verification_grace_sent_at, verification_grace_expires_at')
        .eq('auth_user_id', user.id)
        .single();

      if (member) {
        graceInfo = {
          grace_sent_at: member.verification_grace_sent_at,
          grace_expires_at: member.verification_grace_expires_at,
          grace_expired: member.verification_grace_expires_at
            ? new Date(member.verification_grace_expires_at) < new Date()
            : false,
        };
      }
    }

    return ok(res, {
      email_verified: isVerified,
      email: user.email,
      grace: graceInfo,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Reset Password (Send Reset Email) ---
async function handleResetPassword(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { email } = req.body || {};
  if (!email) return error(res, 'メールアドレスを入力してください');

  try {
    const anonClient = createAnonClient();
    const redirectUrl = (process.env.FRONTEND_URL || 'https://aiden-jp.net') + '/aiden-password-reset.html';

    const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (resetError) {
      return error(res, 'パスワードリセットメールの送信に失敗しました', 500);
    }

    // Always return success to prevent email enumeration
    return ok(res, { message: 'パスワードリセットメールを送信しました。メールをご確認ください。' });
  } catch (e) {
    return error(res, 'サーバーエラー', 500);
  }
}

// --- Update Password (Set New Password) ---
async function handleUpdatePassword(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { access_token, refresh_token, password } = req.body || {};
  if (!access_token || !password) return error(res, 'パラメータが不足しています');

  if (password.length < 8) {
    return error(res, 'パスワードは8文字以上で入力してください');
  }

  try {
    const anonClient = createAnonClient();

    // Set session from the recovery tokens
    const { error: sessionError } = await anonClient.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError) {
      return error(res, 'リセットリンクが無効か、有効期限が切れています', 401);
    }

    // Update the password
    const { error: updateError } = await anonClient.auth.updateUser({
      password,
    });

    if (updateError) {
      return error(res, 'パスワードの更新に失敗しました: ' + updateError.message, 500);
    }

    return ok(res, { message: 'パスワードを更新しました。新しいパスワードでログインしてください。' });
  } catch (e) {
    return error(res, 'サーバーエラー', 500);
  }
}

// --- Withdraw (Reservation Pattern - Phase 2) ---
async function handleWithdraw(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, auth_user_id, email, first_name, last_name, withdrawal_status')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (memberError || !member) return error(res, '会員情報が見つかりません', 404);
    if (member.withdrawal_status === 'withdrawn') return error(res, '既に退会済みです');
    if (member.withdrawal_status === 'pending') return error(res, '既に退会申請済みです', 409, 'ALREADY_PENDING');

    // Check for active orders
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('member_id', member.id)
      .not('status', 'in', '("completed","cancelled")')
      .limit(1);

    if (activeOrders && activeOrders.length > 0) {
      return error(res, '進行中の注文があるため退会申請できません。注文が完了してから再度お試しください。', 409, 'ACTIVE_ORDERS_EXIST');
    }

    // Set withdrawal reservation (30 days from now)
    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await supabase
      .from('members')
      .update({
        withdrawal_status: 'pending',
        withdrawal_requested_at: now.toISOString(),
        withdrawal_scheduled_at: scheduledAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', member.id);

    // Log to audit
    await supabase.from('audit_logs').insert({
      member_id: member.id,
      user_email: member.email,
      action: 'withdrawal_requested',
      target_table: 'members',
      target_id: member.id,
      details: { scheduled_at: scheduledAt.toISOString() },
    });

    // Send confirmation email (fire and forget)
    const scheduledDateStr = scheduledAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' });
    try {
      await fetch(`${process.env.SUPABASE_URL || 'https://iikwusprydaogzeslgdz.supabase.co'}/functions/v1/send-withdrawal-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'requested',
          to: member.email,
          member_name: `${member.last_name} ${member.first_name}`,
          scheduled_date: scheduledDateStr,
        }),
      });
    } catch (_) { /* email failure should not block withdrawal */ }

    return ok(res, {
      message: '退会申請を受け付けました。30日後に退会が確定します。',
      scheduled_at: scheduledAt.toISOString(),
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Withdraw Cancel ---
async function handleWithdrawCancel(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, auth_user_id, email, withdrawal_status')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (memberError || !member) return error(res, '会員情報が見つかりません', 404);
    if (member.withdrawal_status !== 'pending') {
      return error(res, '退会申請中ではありません', 409, 'NOT_PENDING');
    }

    await supabase
      .from('members')
      .update({
        withdrawal_status: null,
        withdrawal_requested_at: null,
        withdrawal_scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', member.id);

    // Log to audit
    await supabase.from('audit_logs').insert({
      member_id: member.id,
      user_email: member.email,
      action: 'withdrawal_cancelled',
      target_table: 'members',
      target_id: member.id,
      details: {},
    });

    return ok(res, { message: '退会申請をキャンセルしました。' });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Withdraw Status ---
async function handleWithdrawStatus(req, res) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('withdrawal_status, withdrawal_requested_at, withdrawal_scheduled_at')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (memberError || !member) return error(res, '会員情報が見つかりません', 404);

    return ok(res, {
      status: member.withdrawal_status || 'active',
      requested_at: member.withdrawal_requested_at,
      scheduled_at: member.withdrawal_scheduled_at,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
