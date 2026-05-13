-- Add client_id to meta_ads_accounts so accounts are scoped per client.
-- Existing rows are left with client_id = NULL (treated as "legacy / all clients").

ALTER TABLE meta_ads_accounts
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Drop the old unique constraint and replace it with one that includes client_id.
-- This allows the same ad account to be saved under different clients
-- (e.g. an agency that manages the same account for two clients, or
--  re-adds an account after a client_id is assigned to legacy rows).
ALTER TABLE meta_ads_accounts
  DROP CONSTRAINT IF EXISTS meta_ads_accounts_user_id_account_id_key;

ALTER TABLE meta_ads_accounts
  ADD CONSTRAINT meta_ads_accounts_user_id_client_id_account_id_key
  UNIQUE (user_id, client_id, account_id);

-- Index for efficient client-scoped lookups
CREATE INDEX IF NOT EXISTS idx_meta_ads_accounts_client_id
  ON meta_ads_accounts (client_id);
