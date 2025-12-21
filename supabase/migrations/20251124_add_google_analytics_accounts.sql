CREATE TABLE google_analytics_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL,
  property_name TEXT,
  account_id TEXT,
  account_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX idx_google_analytics_accounts_user_id ON google_analytics_accounts(user_id);
CREATE INDEX idx_google_analytics_accounts_property_id ON google_analytics_accounts(property_id);

-- Enable RLS
ALTER TABLE google_analytics_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own Google Analytics accounts"
  ON google_analytics_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Google Analytics accounts"
  ON google_analytics_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Google Analytics accounts"
  ON google_analytics_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Google Analytics accounts"
  ON google_analytics_accounts FOR DELETE
  USING (auth.uid() = user_id);

