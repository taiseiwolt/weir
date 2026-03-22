-- Add withdrawal-related columns to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS withdrawal_status TEXT DEFAULT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS withdrawal_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for withdrawal status lookups
CREATE INDEX IF NOT EXISTS idx_members_withdrawal_status ON members(withdrawal_status) WHERE withdrawal_status IS NOT NULL;

-- Add check constraint for valid withdrawal_status values
ALTER TABLE members ADD CONSTRAINT chk_withdrawal_status CHECK (
  withdrawal_status IS NULL OR withdrawal_status IN ('pending', 'withdrawn')
);
