-- Migration: Add client_health_status table
-- Purpose: Store computed health metrics for Master Agency Dashboard
-- Date: 2026-02-09

-- Create client_health_status table
CREATE TABLE client_health_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('green', 'amber', 'red')),
    active_channel_count INTEGER NOT NULL DEFAULT 0,
    total_overdue_tasks INTEGER NOT NULL DEFAULT 0,
    at_risk_tasks INTEGER NOT NULL DEFAULT 0,
    total_budget_cents BIGINT NOT NULL DEFAULT 0,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    budget_health_percentage NUMERIC(5,2),
    next_critical_date DATE,
    next_critical_task TEXT,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id)
);

-- Create indexes for performance
CREATE INDEX idx_client_health_status_client_id ON client_health_status(client_id);
CREATE INDEX idx_client_health_status_status ON client_health_status(status);

-- Enable Row Level Security
ALTER TABLE client_health_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read all health status
CREATE POLICY "Authenticated users can read client health status"
    ON client_health_status
    FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: Authenticated users can insert health status
CREATE POLICY "Authenticated users can insert client health status"
    ON client_health_status
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- RLS Policy: Authenticated users can update health status
CREATE POLICY "Authenticated users can update client health status"
    ON client_health_status
    FOR UPDATE
    TO authenticated
    USING (true);

-- Add updated_at trigger (reuse existing function if available)
CREATE TRIGGER update_client_health_status_updated_at
    BEFORE UPDATE ON client_health_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
