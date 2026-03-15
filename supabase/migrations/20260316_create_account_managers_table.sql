-- Create account_managers table to manage account managers
CREATE TABLE IF NOT EXISTS account_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_account_managers_name ON account_managers(name);

-- Enable RLS
ALTER TABLE account_managers ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow all authenticated users to view, create, update, and delete
CREATE POLICY "Authenticated users can view account managers"
  ON account_managers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert account managers"
  ON account_managers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update account managers"
  ON account_managers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete account managers"
  ON account_managers FOR DELETE
  TO authenticated
  USING (true);
