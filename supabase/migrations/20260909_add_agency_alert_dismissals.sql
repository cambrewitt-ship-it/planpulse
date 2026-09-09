-- Lets a user dismiss a computed (not-yet-persisted) agency alert — the
-- "not spending" / "pacing" alerts on the /agency Alerts panel are derived
-- live from media-plan + ad_performance_metrics data every request, so
-- there's no underlying row to flip a status on the way there is for
-- campaign_audit_findings (which already has status='resolved' and is
-- resolved by updating that table directly instead of via this one).
--
-- alert_id is the same stable id the Alerts panel/API already generates,
-- e.g. "not_spending:<client_id>:<channel>:<month-start>" — scoped to the
-- current month so a dismissal doesn't silently suppress the same problem
-- recurring in a future month.
-- Date: 2026-09-09

CREATE TABLE IF NOT EXISTS agency_alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_alert_dismissals_user_id
  ON agency_alert_dismissals(user_id);

ALTER TABLE agency_alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read agency_alert_dismissals"
  ON agency_alert_dismissals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert agency_alert_dismissals"
  ON agency_alert_dismissals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete agency_alert_dismissals"
  ON agency_alert_dismissals FOR DELETE
  TO authenticated
  USING (true);
