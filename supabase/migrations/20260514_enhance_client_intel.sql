-- Migration: Enhance Client Intelligence Hub
-- Adds goal_type and is_primary to client_campaign_goals.
-- Adds text_content and is_text_doc to client_documents for text-based intel uploads.

ALTER TABLE client_campaign_goals
  ADD COLUMN IF NOT EXISTS goal_type text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS text_content text,
  ADD COLUMN IF NOT EXISTS is_text_doc boolean NOT NULL DEFAULT false;
