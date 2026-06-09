ALTER TABLE google_ads_accounts
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS google_ads_accounts_client_id_idx ON google_ads_accounts(client_id);
