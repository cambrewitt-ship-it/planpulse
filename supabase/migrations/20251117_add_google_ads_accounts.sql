CREATE TABLE google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  connection_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  account_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, customer_id)
);

CREATE INDEX idx_google_ads_accounts_user_id ON google_ads_accounts(user_id);

-- Enable RLS
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own Google Ads accounts"
  ON google_ads_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Google Ads accounts"
  ON google_ads_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Google Ads accounts"
  ON google_ads_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Google Ads accounts"
  ON google_ads_accounts FOR DELETE
  USING (auth.uid() = user_id);

