-- Migration: Add notes field to clients table
-- This allows storing notes about each client

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add comment to document the field
COMMENT ON COLUMN clients.notes IS 'Optional notes about the client';

