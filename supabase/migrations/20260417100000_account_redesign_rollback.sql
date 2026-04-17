-- Rollback for 20260417100000_account_redesign.sql
-- WHY: Restore previous state from _backup_* tables in case migration needs reversal.
-- USAGE: Run only if the forward migration caused issues. Takes ~1 min on the current data volume.

BEGIN;

-- Drop new tables
DROP TABLE IF EXISTS merchant_account_permissions CASCADE;
DROP TABLE IF EXISTS merchant_accounts CASCADE;
DROP TABLE IF EXISTS weir_staff CASCADE;
DROP TABLE IF EXISTS venue_accounts CASCADE;

-- Restore accounts from backup
CREATE TABLE accounts AS SELECT * FROM _backup_accounts_20260417;
ALTER TABLE accounts ADD PRIMARY KEY (id);

-- Restore staff_accounts from backup
CREATE TABLE staff_accounts AS SELECT * FROM _backup_staff_accounts_20260417;
ALTER TABLE staff_accounts ADD PRIMARY KEY (id);

-- Restore corps from backup
CREATE TABLE corps AS SELECT * FROM _backup_corps_20260417;
ALTER TABLE corps ADD PRIMARY KEY (id);

-- Remove merchants records that were copied from corps
DELETE FROM merchants
WHERE id IN (SELECT id FROM _backup_corps_20260417)
  AND id NOT IN (SELECT id FROM _backup_accounts_20260417 WHERE merchant_id IS NOT NULL)
  AND id != 'b2b3fdd3-e723-4c19-9946-281096e64830';

-- NOTE: FK constraints on invoices / sns_posts / sns_connections were swapped to merchants/brands.
-- They now correctly point to merchants/brands, so no rollback is needed for those FKs
-- (merchants/brands are the canonical tables going forward).

COMMIT;
