-- Migration: Fix RLS policies for clients table
-- Purpose: Add missing RLS policies so authenticated users can access clients
-- Date: 2026-02-17

-- Enable RLS if not already enabled (idempotent)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (cleanup)
DROP POLICY IF EXISTS "Authenticated users can read clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON clients;

-- RLS Policy: Authenticated users can read all clients
CREATE POLICY "Authenticated users can read clients"
    ON clients
    FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: Authenticated users can insert clients
CREATE POLICY "Authenticated users can insert clients"
    ON clients
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- RLS Policy: Authenticated users can update clients
CREATE POLICY "Authenticated users can update clients"
    ON clients
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- RLS Policy: Authenticated users can delete clients
CREATE POLICY "Authenticated users can delete clients"
    ON clients
    FOR DELETE
    TO authenticated
    USING (true);
