-- Migration: Add sandbox_plan column to client_media_plan_builder
-- The media plan grid (funnel, audience, custom columns, fee rows, etc.) was
-- previously persisted only to the browser's localStorage, so edits made on
-- one computer never appeared on another. This column stores the full grid
-- state server-side so it syncs across every logged-in session.

ALTER TABLE client_media_plan_builder
  ADD COLUMN IF NOT EXISTS sandbox_plan JSONB;
