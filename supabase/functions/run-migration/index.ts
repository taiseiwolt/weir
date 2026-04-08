// Temporary one-time migration - adds authenticated SELECT policies for Realtime
// SEC: この関数は削除予定。削除されるまでの防御としてservice_role key認証を追加 (04-P0-1)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
serve(async (req) => {
  try {
    // SEC: Authorization headerでservice_role keyを検証 (04-P0-1)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey || token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Forbidden: service_role key required' }), { status: 403 });
    }

    const dbUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!dbUrl) return new Response(JSON.stringify({ error: 'no SUPABASE_DB_URL' }), { status: 500 })
    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.3.5/mod.js')
    const sql = postgres(dbUrl, { ssl: 'require' })
    const results: Record<string, string> = {}

    // reservations: authenticated SELECT all
    const r1 = await sql`SELECT policyname FROM pg_policies WHERE tablename='reservations' AND policyname='authenticated_select_all'`
    if (r1.length > 0) {
      results.reservations_auth = 'already exists'
    } else {
      await sql`CREATE POLICY "authenticated_select_all" ON reservations FOR SELECT TO authenticated USING (true)`
      results.reservations_auth = 'created'
    }

    // orders: authenticated SELECT all
    const r2 = await sql`SELECT policyname FROM pg_policies WHERE tablename='orders' AND policyname='orders_authenticated_select_all'`
    if (r2.length > 0) {
      results.orders_auth = 'already exists'
    } else {
      await sql`CREATE POLICY "orders_authenticated_select_all" ON orders FOR SELECT TO authenticated USING (true)`
      results.orders_auth = 'created'
    }

    await sql.end()
    return new Response(JSON.stringify({ success: true, results }))
  } catch(e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500 }) }
})
