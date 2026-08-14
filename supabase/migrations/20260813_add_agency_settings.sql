-- Agency-level settings (one row per user)
CREATE TABLE IF NOT EXISTS agency_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_name         text NOT NULL DEFAULT '',
  agency_address      text NOT NULL DEFAULT '',
  agency_email        text NOT NULL DEFAULT '',
  agency_phone        text NOT NULL DEFAULT '',
  logo_url            text,
  bank_name           text NOT NULL DEFAULT '',
  bank_account_name   text NOT NULL DEFAULT '',
  bank_account_number text NOT NULL DEFAULT '',
  invoice_notes       text NOT NULL DEFAULT '',
  invoice_due_days    integer NOT NULL DEFAULT 14,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_settings_user_id_key UNIQUE (user_id)
);

ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_settings_select" ON agency_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "agency_settings_insert" ON agency_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "agency_settings_update" ON agency_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add billing address to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_address text;
