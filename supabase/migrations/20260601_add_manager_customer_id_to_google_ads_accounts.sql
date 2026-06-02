ALTER TABLE google_ads_accounts
  ADD COLUMN IF NOT EXISTS manager_customer_id TEXT;
