-- CRM Send Logs table for tracking email campaign delivery history
-- Referenced by aiden-customer-admin.html CRM配信履歴 section

CREATE TABLE IF NOT EXISTS crm_send_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text,
  content_type text DEFAULT 'free',
  channel text DEFAULT 'email',
  sent_to_count integer DEFAULT 0,
  segment_filters jsonb,
  status text DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups by brand
CREATE INDEX idx_crm_send_logs_brand_id ON crm_send_logs(brand_id);
CREATE INDEX idx_crm_send_logs_sent_at ON crm_send_logs(sent_at DESC);

-- RLS
ALTER TABLE crm_send_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON crm_send_logs TO service_role USING (true) WITH CHECK (true);

-- Allow authenticated users to read their brand's logs
CREATE POLICY "authenticated_read_own_brand" ON crm_send_logs
  FOR SELECT TO authenticated
  USING (
    brand_id IN (
      SELECT brand_id FROM staff_accounts WHERE auth_uid = auth.uid()
    )
  );

-- updated_at trigger
CREATE TRIGGER set_updated_at_crm_send_logs
  BEFORE UPDATE ON crm_send_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
