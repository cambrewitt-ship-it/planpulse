-- Migration: Client Hub section ordering
-- Adds section_order (jsonb array of section keys) to client_hub_config so
-- agencies can drag-reorder which sections appear where on the client
-- portal, independent of section visibility (`sections`).
-- NULL means "no custom order saved yet" — the API falls back to the
-- canonical SECTION_KEYS order (see src/lib/client-hub/section-meta.ts).
-- Date: 2026-08-23

ALTER TABLE client_hub_config ADD COLUMN IF NOT EXISTS section_order jsonb;
