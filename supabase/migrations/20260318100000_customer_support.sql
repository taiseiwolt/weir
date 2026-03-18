-- ============================================================
-- AIden CS: カスタマーサポート機能 (CS-1, CS-2, CS-3)
-- 2026-03-18
-- ============================================================

-- ===== CS-1: 顧客→AIden運営 サポートチケット =====

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  staff_account_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'ticket' CHECK (type IN ('realtime', 'ticket')),
  category TEXT NOT NULL DEFAULT 'settings' CHECK (category IN ('order_payment', 'settings', 'billing', 'feature_request')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_brand ON support_tickets(brand_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_select_staff" ON support_tickets;
CREATE POLICY "support_tickets_select_staff" ON support_tickets
  FOR SELECT USING (
    brand_id IN (
      SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "support_tickets_insert_staff" ON support_tickets;
CREATE POLICY "support_tickets_insert_staff" ON support_tickets
  FOR INSERT WITH CHECK (
    brand_id IN (
      SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_tickets_update_staff" ON support_tickets;
CREATE POLICY "support_tickets_update_staff" ON support_tickets
  FOR UPDATE USING (
    brand_id IN (
      SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Anon read for admin panel (AIden運営側)
DROP POLICY IF EXISTS "support_tickets_select_anon" ON support_tickets;
CREATE POLICY "support_tickets_select_anon" ON support_tickets
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "support_tickets_update_anon" ON support_tickets;
CREATE POLICY "support_tickets_update_anon" ON support_tickets
  FOR UPDATE TO anon USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated
  BEFORE UPDATE ON support_tickets FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_updated_at();


-- ===== CS-1: サポートメッセージ =====

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'aiden')),
  sender_id UUID,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_messages_select_staff" ON support_messages;
CREATE POLICY "support_messages_select_staff" ON support_messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT t.id FROM support_tickets t
      JOIN staff_accounts sa ON sa.brand_id = t.brand_id
      WHERE sa.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "support_messages_insert_staff" ON support_messages;
CREATE POLICY "support_messages_insert_staff" ON support_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT t.id FROM support_tickets t
      JOIN staff_accounts sa ON sa.brand_id = t.brand_id
      WHERE sa.auth_user_id = auth.uid()
    )
  );

-- Anon for admin panel
DROP POLICY IF EXISTS "support_messages_select_anon" ON support_messages;
CREATE POLICY "support_messages_select_anon" ON support_messages
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "support_messages_insert_anon" ON support_messages;
CREATE POLICY "support_messages_insert_anon" ON support_messages
  FOR INSERT TO anon WITH CHECK (true);


-- ===== CS-2: エンドユーザー→顧客 チャット =====

CREATE TABLE IF NOT EXISTS customer_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  guest_identifier TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_chats_store ON customer_chats(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_chats_status ON customer_chats(status);

ALTER TABLE customer_chats ENABLE ROW LEVEL SECURITY;

-- Anon can create and read (end users use anon key)
DROP POLICY IF EXISTS "customer_chats_select_all" ON customer_chats;
CREATE POLICY "customer_chats_select_all" ON customer_chats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "customer_chats_insert_all" ON customer_chats;
CREATE POLICY "customer_chats_insert_all" ON customer_chats
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "customer_chats_update_all" ON customer_chats;
CREATE POLICY "customer_chats_update_all" ON customer_chats
  FOR UPDATE USING (true);


CREATE TABLE IF NOT EXISTS customer_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES customer_chats(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'store')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_chat_messages_chat ON customer_chat_messages(chat_id);

ALTER TABLE customer_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_chat_messages_select_all" ON customer_chat_messages;
CREATE POLICY "customer_chat_messages_select_all" ON customer_chat_messages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "customer_chat_messages_insert_all" ON customer_chat_messages;
CREATE POLICY "customer_chat_messages_insert_all" ON customer_chat_messages
  FOR INSERT WITH CHECK (true);


-- ===== CS-3: FAQ =====

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_common BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faqs_brand ON faqs(brand_id);
CREATE INDEX IF NOT EXISTS idx_faqs_common ON faqs(is_common) WHERE is_common = true;

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Everyone can read active FAQs
DROP POLICY IF EXISTS "faqs_select_all" ON faqs;
CREATE POLICY "faqs_select_all" ON faqs
  FOR SELECT USING (true);

-- Staff can manage brand FAQs
DROP POLICY IF EXISTS "faqs_insert_staff" ON faqs;
CREATE POLICY "faqs_insert_staff" ON faqs
  FOR INSERT WITH CHECK (
    brand_id IN (
      SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
    )
    OR brand_id IS NULL
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "faqs_update_staff" ON faqs;
CREATE POLICY "faqs_update_staff" ON faqs
  FOR UPDATE USING (
    brand_id IN (
      SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
    )
    OR brand_id IS NULL
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "faqs_delete_staff" ON faqs;
CREATE POLICY "faqs_delete_staff" ON faqs
  FOR DELETE USING (
    brand_id IN (
      SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
    )
    OR brand_id IS NULL
    OR auth.role() = 'service_role'
  );

-- Anon policies for admin panel
DROP POLICY IF EXISTS "faqs_insert_anon" ON faqs;
CREATE POLICY "faqs_insert_anon" ON faqs
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "faqs_update_anon" ON faqs;
CREATE POLICY "faqs_update_anon" ON faqs
  FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "faqs_delete_anon" ON faqs;
CREATE POLICY "faqs_delete_anon" ON faqs
  FOR DELETE TO anon USING (true);


-- ===== Enable Realtime for support tables =====
ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE customer_chat_messages;


-- ===== CS-3: Demo FAQ data =====

-- 共通FAQ 10件 (brand_id = NULL, is_common = true)
INSERT INTO faqs (brand_id, category, question, answer, sort_order, is_common, is_active) VALUES
(NULL, 'order', '注文をキャンセルしたいのですが、どうすればいいですか？', '注文確認後すぐであればキャンセル可能です。注文履歴画面から該当の注文を選択し「キャンセルリクエスト」ボタンを押してください。店舗が調理を開始している場合はキャンセルできない場合があります。', 1, true, true),
(NULL, 'order', '注文内容を変更できますか？', '申し訳ございませんが、注文確定後の内容変更はできません。キャンセル後に再度ご注文ください。店舗が調理を開始している場合はキャンセルもできませんのでご了承ください。', 2, true, true),
(NULL, 'order', '注文が届きません。どうすればいいですか？', '注文トラッキング画面で最新の配達状況をご確認ください。配達予定時刻を大幅に過ぎている場合は、チャットサポートまでお問い合わせください。', 3, true, true),
(NULL, 'delivery', '配達エリアはどこまでですか？', '配達エリアは店舗ごとに異なります。店舗ページで配達可能エリアをご確認いただけます。一般的に店舗から半径3km以内が目安です。', 1, true, true),
(NULL, 'delivery', '配達時間はどのくらいかかりますか？', '通常30〜50分程度ですが、混雑状況や天候により変動します。注文後、トラッキング画面でリアルタイムの配達予想時間をご確認いただけます。', 2, true, true),
(NULL, 'delivery', '配達先を変更できますか？', '注文確定後の配達先変更はできません。正しい住所を入力してからご注文ください。', 3, true, true),
(NULL, 'payment', '使える支払方法は何ですか？', 'クレジットカード（Visa, Mastercard, JCB, AMEX）、デビットカード、Apple Pay、Google Payに対応しています。店舗によって利用可能な決済方法が異なる場合があります。', 1, true, true),
(NULL, 'payment', '領収書は発行できますか？', 'はい。注文完了画面またはマイページの注文履歴から領収書をダウンロードできます。', 2, true, true),
(NULL, 'payment', '返金はどのくらいで反映されますか？', 'キャンセルが承認された場合、通常3〜5営業日以内にご利用のお支払い方法に返金されます。', 3, true, true),
(NULL, 'other', 'アカウントを削除したいです', 'マイページの「アカウント設定」から退会手続きが可能です。退会するとポイントや注文履歴が全て削除されますのでご注意ください。', 1, true, true);

-- ブランド独自FAQ 3件 (brand_id = 焼肉 炭火亭)
INSERT INTO faqs (brand_id, category, question, answer, sort_order, is_common, is_active)
SELECT b.id, 'order', 'おまかせコースの内容を教えてください', '季節に応じた厳選部位5種＋サラダ＋ご飯＋デザートのセットです。アレルギーがある場合は注文時にお知らせください。内容は仕入れ状況により変更になる場合があります。', 1, false, true
FROM brands b WHERE b.name = '焼肉 炭火亭' LIMIT 1;

INSERT INTO faqs (brand_id, category, question, answer, sort_order, is_common, is_active)
SELECT b.id, 'delivery', 'テイクアウトの受取時間を指定できますか？', 'はい、ご注文時に受取希望時間を選択できます。最短15分後から、当日中の時間帯をお選びいただけます。', 2, false, true
FROM brands b WHERE b.name = '焼肉 炭火亭' LIMIT 1;

INSERT INTO faqs (brand_id, category, question, answer, sort_order, is_common, is_active)
SELECT b.id, 'other', 'ポイントの有効期限はありますか？', '最後のお買い物から1年間有効です。1年以上ご利用がない場合、ポイントは失効します。定期的なご利用をおすすめします。', 3, false, true
FROM brands b WHERE b.name = '焼肉 炭火亭' LIMIT 1;
