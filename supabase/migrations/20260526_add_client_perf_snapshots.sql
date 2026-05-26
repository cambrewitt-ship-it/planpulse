-- Daily CPA/metric snapshots — immutable once written.
-- Each row captures the running cumulative metric value for a given day
-- as observed at the time of first load. Snapshots are written once and
-- never overwritten (ignoreDuplicates on upsert), so historical chart
-- points stay stable even as ad platforms retroactively update attribution.

CREATE TABLE IF NOT EXISTS client_perf_snapshots (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date             DATE        NOT NULL,
  metric           TEXT        NOT NULL,
  value            NUMERIC     NOT NULL,
  -- Stable string keys built from sorted filter params ('' = no filter)
  platforms_key    TEXT        NOT NULL DEFAULT '',
  campaign_ids_key TEXT        NOT NULL DEFAULT '',
  meta_action_type TEXT        NOT NULL DEFAULT '',
  snapped_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE (client_id, date, metric, platforms_key, campaign_ids_key, meta_action_type)
);

-- Index for the common query pattern: client + metric + filters + date range
CREATE INDEX IF NOT EXISTS client_perf_snapshots_lookup
  ON client_perf_snapshots (client_id, metric, platforms_key, campaign_ids_key, meta_action_type, date);

-- Row-level security: users can only read/write their own clients' snapshots
ALTER TABLE client_perf_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage snapshots for their own clients"
  ON client_perf_snapshots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_perf_snapshots.client_id
        AND clients.user_id = auth.uid()
    )
  );
