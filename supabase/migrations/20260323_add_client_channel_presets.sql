-- Stores per-client, per-channel metric preset selections
CREATE TABLE IF NOT EXISTS client_channel_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_name text NOT NULL,
  preset_name text NOT NULL,
  custom_metrics text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, channel_name)
);

ALTER TABLE client_channel_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read client_channel_presets"
  ON client_channel_presets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert client_channel_presets"
  ON client_channel_presets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update client_channel_presets"
  ON client_channel_presets FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete client_channel_presets"
  ON client_channel_presets FOR DELETE
  TO authenticated
  USING (true);
