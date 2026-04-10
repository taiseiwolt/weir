import { createClient } from '@supabase/supabase-js';

/**
 * Extract and verify Bearer token from request.
 * Returns { user, supabaseClient } or null if unauthenticated.
 */
export async function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  // Create a Supabase client with the user's JWT to verify it
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await userClient.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return { user, token };
}

/**
 * Require authentication. Sends 401 response if not authenticated.
 * Returns { user, token } or null (response already sent).
 */
export async function requireAuth(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401).json({ error: '認証が必要です' });
    return null;
  }
  return auth;
}

/**
 * Check if authenticated user is a staff member of the given store.
 * Uses the service-role Supabase client to query staff_accounts.
 * Returns true if user is staff/manager/owner of the store.
 */
export async function isStoreStaffMember(authUserId, storeId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Get store's brand_id
  const { data: store } = await adminClient
    .from('venues')
    .select('brand_id')
    .eq('id', storeId)
    .single();

  if (!store) return false;

  // Check if user is staff for this brand
  const { data: staff } = await adminClient
    .from('staff_accounts')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('brand_id', store.brand_id)
    .limit(1);

  return staff && staff.length > 0;
}
