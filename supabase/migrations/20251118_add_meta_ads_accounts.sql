CREATE TABLE meta_ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  account_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, account_id)
);

CREATE INDEX idx_meta_ads_accounts_user_id ON meta_ads_accounts(user_id);
CREATE INDEX idx_meta_ads_accounts_account_id ON meta_ads_accounts(account_id);

-- Enable RLS
ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own Meta Ads accounts"
  ON meta_ads_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Meta Ads accounts"
  ON meta_ads_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Meta Ads accounts"
  ON meta_ads_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Meta Ads accounts"
  ON meta_ads_accounts FOR DELETE
  USING (auth.uid() = user_id);

