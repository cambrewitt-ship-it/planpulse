-- Migration: Fix conflicting RLS policies on client_health_status
-- Purpose: Remove stale org-based policies that reference organization_members
--          and conflict with the newer authenticated-user policies.
--          client_health_status does not have an organization_id column,
--          so the org-based policies cause errors on every query.
-- Date: 2026-02-17

-- Drop the stale org-based policies on client_health_status
DROP POLICY IF EXISTS "Org members can read" ON client_health_status;
DROP POLICY IF EXISTS "Org members can insert" ON client_health_status;
DROP POLICY IF EXISTS "Admins update" ON client_health_status;
DROP POLICY IF EXISTS "Admins delete" ON client_health_status;

-- Also check clients table for the same stale org policies
DROP POLICY IF EXISTS "Org members can read" ON clients;
DROP POLICY IF EXISTS "Org members can insert" ON clients;
DROP POLICY IF EXISTS "Admins update" ON clients;
DROP POLICY IF EXISTS "Admins delete" ON clients;
DROP POLICY IF EXISTS "org_members_can_read" ON clients;
DROP POLICY IF EXISTS "org_members_can_update" ON clients;
DROP POLICY IF EXISTS "org_members_can_delete" ON clients;

-- Also clean up any stale org policies on related tables
DROP POLICY IF EXISTS "Org members can read" ON client_tasks;
DROP POLICY IF EXISTS "Org members can insert" ON client_tasks;
DROP POLICY IF EXISTS "Admins update" ON client_tasks;
DROP POLICY IF EXISTS "Admins delete" ON client_tasks;

-- Ensure the correct simple authenticated policies exist on client_health_status
-- (these were added by 20260209_add_client_health_status.sql but may have been
--  overridden by the org-based policies)
DROP POLICY IF EXISTS "Authenticated users can read client health status" ON client_health_status;
DROP POLICY IF EXISTS "Authenticated users can insert client health status" ON client_health_status;
DROP POLICY IF EXISTS "Authenticated users can update client health status" ON client_health_status;
DROP POLICY IF EXISTS "Authenticated users can delete client health status" ON client_health_status;

CREATE POLICY "Authenticated users can read client health status"
    ON client_health_status
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert client health status"
    ON client_health_status
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update client health status"
    ON client_health_status
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete client health status"
    ON client_health_status
    FOR DELETE
    TO authenticated
    USING (true);
