-- Migration: Client Intelligence Hub
-- Adds tables for client briefs, brief version history, documents, handover notes, and campaign goals.
-- Does not modify any existing tables.

-- ── client_briefs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_briefs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  objectives     text,
  kpis           text,
  budget         numeric,
  start_date     date,
  end_date       date,
  target_audience text,
  brief_body     text,
  is_locked      boolean NOT NULL DEFAULT false,
  locked_at      timestamptz,
  locked_by      uuid REFERENCES auth.users(id),
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_briefs_client_id ON client_briefs(client_id);

ALTER TABLE client_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_briefs_select" ON client_briefs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_briefs_insert" ON client_briefs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_briefs_update" ON client_briefs
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_briefs_delete" ON client_briefs
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── client_brief_versions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_brief_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brief_id   uuid NOT NULL REFERENCES client_briefs(id) ON DELETE CASCADE,
  brief_data jsonb NOT NULL,
  version    integer NOT NULL,
  saved_at   timestamptz NOT NULL DEFAULT now(),
  saved_by   uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_brief_versions_client_id ON client_brief_versions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_brief_versions_brief_id  ON client_brief_versions(brief_id);

ALTER TABLE client_brief_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_brief_versions_select" ON client_brief_versions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_brief_versions_insert" ON client_brief_versions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_brief_versions_delete" ON client_brief_versions
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── client_documents ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  file_url    text NOT NULL,
  file_type   text NOT NULL DEFAULT 'other',
  -- Valid values: contract, brief, rate_card, brand_guidelines, media_schedule, other
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents(client_id);

ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_documents_select" ON client_documents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_documents_insert" ON client_documents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_documents_update" ON client_documents
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_documents_delete" ON client_documents
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── client_notes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note_body   text NOT NULL,
  note_type   text NOT NULL DEFAULT 'general',
  -- Valid values: handover, client_intel, general
  is_pinned   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);

ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_notes_select" ON client_notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_notes_insert" ON client_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_notes_update" ON client_notes
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_notes_delete" ON client_notes
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── client_campaign_goals ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_campaign_goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brief_id       uuid REFERENCES client_briefs(id) ON DELETE SET NULL,
  channel        text NOT NULL,
  metric         text NOT NULL,
  -- e.g. CPL, CTR, CPM, ROAS, CPC
  benchmark_id   uuid REFERENCES channel_benchmarks(id) ON DELETE SET NULL,
  target_value   numeric,
  stretch_value  numeric,
  floor_value    numeric,
  set_by         uuid REFERENCES auth.users(id),
  set_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_campaign_goals_client_id ON client_campaign_goals(client_id);

ALTER TABLE client_campaign_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_campaign_goals_select" ON client_campaign_goals
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_campaign_goals_insert" ON client_campaign_goals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_campaign_goals_update" ON client_campaign_goals
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_campaign_goals_delete" ON client_campaign_goals
  FOR DELETE USING (auth.role() = 'authenticated');
