-- ============================================================
-- AIden CS: AI Chat Support (store_policies, chat_sessions, chat_messages, faq_embeddings)
-- 2026-03-24
-- ============================================================

-- 0. Enable pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ===== store_policies: 店舗/ブランドレベル運営方針 =====

CREATE TABLE IF NOT EXISTS store_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('refund', 'allergen', 'business_hours', 'takeout_delivery', 'points_coupons', 'other')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT store_policies_scope CHECK (store_id IS NOT NULL OR brand_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_store_policies_store ON store_policies(store_id);
CREATE INDEX IF NOT EXISTS idx_store_policies_brand ON store_policies(brand_id);
CREATE INDEX IF NOT EXISTS idx_store_policies_type ON store_policies(policy_type);

ALTER TABLE store_policies ENABLE ROW LEVEL SECURITY;

-- Staff can read/write their own brand/store policies
DROP POLICY IF EXISTS "store_policies_select_staff" ON store_policies;
CREATE POLICY "store_policies_select_staff" ON store_policies
  FOR SELECT USING (
    brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    OR store_id IN (
      SELECT s.id FROM stores s
      JOIN staff_accounts sa ON sa.brand_id = s.brand_id
      WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "store_policies_insert_staff" ON store_policies;
CREATE POLICY "store_policies_insert_staff" ON store_policies
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    OR store_id IN (
      SELECT s.id FROM stores s
      JOIN staff_accounts sa ON sa.brand_id = s.brand_id
      WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "store_policies_update_staff" ON store_policies;
CREATE POLICY "store_policies_update_staff" ON store_policies
  FOR UPDATE USING (
    brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    OR store_id IN (
      SELECT s.id FROM stores s
      JOIN staff_accounts sa ON sa.brand_id = s.brand_id
      WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "store_policies_delete_staff" ON store_policies;
CREATE POLICY "store_policies_delete_staff" ON store_policies
  FOR DELETE USING (
    brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    OR store_id IN (
      SELECT s.id FROM stores s
      JOIN staff_accounts sa ON sa.brand_id = s.brand_id
      WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Anon read for admin panel (AIden運営側)
DROP POLICY IF EXISTS "store_policies_select_anon" ON store_policies;
CREATE POLICY "store_policies_select_anon" ON store_policies
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "store_policies_update_anon" ON store_policies;
CREATE POLICY "store_policies_update_anon" ON store_policies
  FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "store_policies_insert_anon" ON store_policies;
CREATE POLICY "store_policies_insert_anon" ON store_policies
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "store_policies_delete_anon" ON store_policies;
CREATE POLICY "store_policies_delete_anon" ON store_policies
  FOR DELETE TO anon USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_store_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_policies_updated ON store_policies;
CREATE TRIGGER trg_store_policies_updated
  BEFORE UPDATE ON store_policies FOR EACH ROW
  EXECUTE FUNCTION update_store_policies_updated_at();


-- ===== chat_sessions: AIチャットセッション =====

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type TEXT NOT NULL CHECK (session_type IN ('merchant', 'enduser')),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES members(id) ON DELETE SET NULL,
  operator_id UUID,
  guest_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'resolved', 'closed')),
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_store ON chat_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_brand ON chat_sessions(brand_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_customer ON chat_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_type_status ON chat_sessions(session_type, status);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Service role: full access (for API server-side operations)
DROP POLICY IF EXISTS "chat_sessions_service_role" ON chat_sessions;
CREATE POLICY "chat_sessions_service_role" ON chat_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Staff can read their brand's sessions
DROP POLICY IF EXISTS "chat_sessions_select_staff" ON chat_sessions;
CREATE POLICY "chat_sessions_select_staff" ON chat_sessions
  FOR SELECT USING (
    brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
  );

-- Members can read their own sessions
DROP POLICY IF EXISTS "chat_sessions_select_member" ON chat_sessions;
CREATE POLICY "chat_sessions_select_member" ON chat_sessions
  FOR SELECT USING (
    customer_id IS NOT NULL AND customer_id = (
      SELECT m.id FROM members m WHERE m.auth_user_id = auth.uid() LIMIT 1
    )
  );

-- Anon: for admin panel and guest chat (filtered by guest_session_id client-side)
DROP POLICY IF EXISTS "chat_sessions_anon_select" ON chat_sessions;
CREATE POLICY "chat_sessions_anon_select" ON chat_sessions
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "chat_sessions_anon_insert" ON chat_sessions;
CREATE POLICY "chat_sessions_anon_insert" ON chat_sessions
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "chat_sessions_anon_update" ON chat_sessions;
CREATE POLICY "chat_sessions_anon_update" ON chat_sessions
  FOR UPDATE TO anon USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_sessions_updated ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated
  BEFORE UPDATE ON chat_sessions FOR EACH ROW
  EXECUTE FUNCTION update_chat_sessions_updated_at();


-- ===== chat_messages: AIチャットメッセージ =====

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  feedback TEXT CHECK (feedback IS NULL OR feedback IN ('helpful', 'not_helpful')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_feedback ON chat_messages(feedback) WHERE feedback IS NOT NULL;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DROP POLICY IF EXISTS "chat_messages_service_role" ON chat_messages;
CREATE POLICY "chat_messages_service_role" ON chat_messages
  FOR ALL USING (auth.role() = 'service_role');

-- Staff can read messages of their brand's sessions
DROP POLICY IF EXISTS "chat_messages_select_staff" ON chat_messages;
CREATE POLICY "chat_messages_select_staff" ON chat_messages
  FOR SELECT USING (
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      WHERE cs.brand_id IN (SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid())
    )
  );

-- Members can read their own messages
DROP POLICY IF EXISTS "chat_messages_select_member" ON chat_messages;
CREATE POLICY "chat_messages_select_member" ON chat_messages
  FOR SELECT USING (
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      WHERE cs.customer_id = (SELECT m.id FROM members m WHERE m.auth_user_id = auth.uid() LIMIT 1)
    )
  );

-- Anon: for admin panel and guest chat
DROP POLICY IF EXISTS "chat_messages_anon_select" ON chat_messages;
CREATE POLICY "chat_messages_anon_select" ON chat_messages
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "chat_messages_anon_insert" ON chat_messages;
CREATE POLICY "chat_messages_anon_insert" ON chat_messages
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "chat_messages_anon_update" ON chat_messages;
CREATE POLICY "chat_messages_anon_update" ON chat_messages
  FOR UPDATE TO anon USING (true);

-- Enable Realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;


-- ===== faq_embeddings: RAG用エンベディング =====

CREATE TABLE IF NOT EXISTS faq_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('faq', 'manual')),
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_embeddings_source ON faq_embeddings(source);

-- IVFFlat index for vector search (requires rows to exist; create after data insertion)
-- Run manually after embedding generation:
-- CREATE INDEX IF NOT EXISTS idx_faq_embeddings_vector ON faq_embeddings
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

ALTER TABLE faq_embeddings ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DROP POLICY IF EXISTS "faq_embeddings_service_role" ON faq_embeddings;
CREATE POLICY "faq_embeddings_service_role" ON faq_embeddings
  FOR ALL USING (auth.role() = 'service_role');

-- Anon read for admin panel
DROP POLICY IF EXISTS "faq_embeddings_anon_select" ON faq_embeddings;
CREATE POLICY "faq_embeddings_anon_select" ON faq_embeddings
  FOR SELECT TO anon USING (true);


-- ===== RPC: Vector similarity search for RAG =====

CREATE OR REPLACE FUNCTION match_faq_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  chunk_text TEXT,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    fe.id,
    fe.source,
    fe.chunk_text,
    1 - (fe.embedding <=> query_embedding) AS similarity
  FROM faq_embeddings fe
  WHERE 1 - (fe.embedding <=> query_embedding) > match_threshold
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ===== pg_cron: チャットログ自動削除（180日） =====

-- Weekly cleanup: Sunday UTC 18:00 (JST Monday 3:00)
SELECT cron.schedule(
  'cleanup-old-chat-logs',
  '0 18 * * 0',
  $$
    -- Delete old messages first
    DELETE FROM chat_messages
    WHERE session_id IN (
      SELECT id FROM chat_sessions
      WHERE status IN ('resolved', 'closed')
        AND updated_at < now() - interval '180 days'
    );
    -- Then delete empty sessions
    DELETE FROM chat_sessions
    WHERE status IN ('resolved', 'closed')
      AND updated_at < now() - interval '180 days'
      AND id NOT IN (SELECT DISTINCT session_id FROM chat_messages);
    -- Log to audit_logs if table exists
    INSERT INTO audit_logs (action, details, created_at)
    SELECT 'chat_log_cleanup', jsonb_build_object('cleaned_at', now()), now()
    WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public');
  $$
);


-- ===== Extend anonymize_withdrawn_members to handle chat_sessions =====

-- Add chat_sessions anonymization to the existing function
-- This is additive; the original function body is preserved in the previous migration.
-- Run this as a separate step after the original function is confirmed working.

CREATE OR REPLACE FUNCTION anonymize_chat_for_withdrawn_member(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nullify customer_id in chat_sessions (keep messages for analytics)
  UPDATE chat_sessions
  SET customer_id = NULL, updated_at = now()
  WHERE customer_id = p_member_id;
END;
$$;
