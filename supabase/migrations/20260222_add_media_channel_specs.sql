-- Migration: Add media_channel_specs table
-- This table stores specs (dimensions) for each media channel library entry

CREATE TABLE IF NOT EXISTS media_channel_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_channel_library_id UUID NOT NULL REFERENCES media_channel_library(id) ON DELETE CASCADE,
  spec_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_channel_specs_spec_text_not_empty CHECK (LENGTH(TRIM(spec_text)) > 0)
);

-- Create index for faster lookups by media_channel_library_id
CREATE INDEX IF NOT EXISTS idx_media_channel_specs_library_id ON media_channel_specs(media_channel_library_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_media_channel_specs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_media_channel_specs_updated_at
  BEFORE UPDATE ON media_channel_specs
  FOR EACH ROW
  EXECUTE FUNCTION update_media_channel_specs_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE media_channel_specs ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view media channel specs
CREATE POLICY "Users can view media channel specs"
  ON media_channel_specs
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: All authenticated users can insert media channel specs
CREATE POLICY "Users can insert media channel specs"
  ON media_channel_specs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: All authenticated users can update media channel specs
CREATE POLICY "Users can update media channel specs"
  ON media_channel_specs
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: All authenticated users can delete media channel specs
CREATE POLICY "Users can delete media channel specs"
  ON media_channel_specs
  FOR DELETE
  USING (auth.role() = 'authenticated');
