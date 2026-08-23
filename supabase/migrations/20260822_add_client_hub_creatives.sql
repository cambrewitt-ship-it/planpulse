-- Migration: Client Hub ad creative screenshot gallery
-- Simple freeform image grid so the agency can show the client what their
-- active ad previews look like — upload-order only, optional per-image
-- caption, no channel/campaign tagging structure.
-- Date: 2026-08-22

CREATE TABLE IF NOT EXISTS client_hub_creatives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  caption       text,
  display_order integer NOT NULL DEFAULT 0,
  uploaded_by   uuid REFERENCES auth.users(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_hub_creatives_client_id ON client_hub_creatives(client_id);

ALTER TABLE client_hub_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_hub_creatives_owner_all" ON client_hub_creatives FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_creatives.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_creatives.client_id AND c.user_id = auth.uid()));
