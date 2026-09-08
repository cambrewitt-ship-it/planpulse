-- Per-client, per-channel Meta conversion event selection, persisted server-side.
--
-- Meta doesn't have one canonical "conversions" number the way Google Ads
-- does, so ad_performance_metrics.conversions is always NULL for meta-ads
-- rows by design (see saveMetaAdsMetrics in src/lib/ad-metrics.ts) — the raw
-- per-action breakdown is stored separately in meta_actions jsonb, and the
-- agency picks which action_type counts as "the conversion" for a given
-- channel (e.g. offsite_conversion.fb_pixel_complete_registration).
--
-- That picker already existed on the channel performance card
-- (ChannelPerformanceCard's "Conv. Events" selector), but only wrote the
-- choice to browser localStorage (conv-event-{clientId}-{channel.id}) — so
-- nothing server-side (the agency chat agent, Setup Auditor, reports) could
-- ever see which event was selected, and always fell back to the NULL
-- conversions column, reporting 0 even when the dashboard correctly showed
-- a real count right next to it. This table gives that selection a home
-- server-side so any backend consumer can read it.
--
-- channel_key mirrors the identifier the card already keys its own
-- localStorage entries by: the media plan channel line-item id
-- (client_media_plan_builder.channels[].id) when present, falling back to
-- the channel name for older plans without one.
-- Date: 2026-09-08

CREATE TABLE IF NOT EXISTS client_channel_conversion_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_key text NOT NULL,
  conversion_action_type text NOT NULL,
  conversion_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, channel_key)
);

CREATE INDEX IF NOT EXISTS idx_client_channel_conversion_config_client_id
  ON client_channel_conversion_config(client_id);

ALTER TABLE client_channel_conversion_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read client_channel_conversion_config"
  ON client_channel_conversion_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert client_channel_conversion_config"
  ON client_channel_conversion_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update client_channel_conversion_config"
  ON client_channel_conversion_config FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete client_channel_conversion_config"
  ON client_channel_conversion_config FOR DELETE
  TO authenticated
  USING (true);
