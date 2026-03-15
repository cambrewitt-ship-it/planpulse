-- Add due_date and client_id to agency_notes so notes can be
-- scoped per-client and surface as action items in dashboard-v2.

ALTER TABLE agency_notes
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS agency_notes_client_id_idx ON agency_notes (client_id);
