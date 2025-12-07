-- Migration: Add media_channel_library table
-- This table stores library entries for media channels with title and notes

CREATE TABLE IF NOT EXISTS media_channel_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  notes TEXT,
  channel_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_channel_library_title_not_empty CHECK (LENGTH(TRIM(title)) > 0)
);

-- Create index for faster lookups by channel_type
CREATE INDEX IF NOT EXISTS idx_media_channel_library_channel_type ON media_channel_library(channel_type);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_media_channel_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_media_channel_library_updated_at
  BEFORE UPDATE ON media_channel_library
  FOR EACH ROW
  EXECUTE FUNCTION update_media_channel_library_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE media_channel_library ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view media channel library entries
CREATE POLICY "Users can view media channel library"
  ON media_channel_library
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: All authenticated users can insert media channel library entries
CREATE POLICY "Users can insert media channel library"
  ON media_channel_library
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: All authenticated users can update media channel library entries
CREATE POLICY "Users can update media channel library"
  ON media_channel_library
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: All authenticated users can delete media channel library entries
CREATE POLICY "Users can delete media channel library"
  ON media_channel_library
  FOR DELETE
  USING (auth.role() = 'authenticated');

