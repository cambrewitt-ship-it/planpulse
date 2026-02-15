-- Migration: Add client_tasks table
-- Purpose: Per-client/per-channel task tracking for health calculations
-- Date: 2026-02-09

-- Create client_tasks table
CREATE TABLE client_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN ('setup', 'health_check')),
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'fortnightly', 'monthly')),
    last_completed_at TIMESTAMPTZ,
    next_due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX idx_client_tasks_channel_id ON client_tasks(channel_id);
CREATE INDEX idx_client_tasks_due_date ON client_tasks(due_date);
CREATE INDEX idx_client_tasks_next_due_date ON client_tasks(next_due_date);
CREATE INDEX idx_client_tasks_assigned_to ON client_tasks(assigned_to);

-- Composite index for common queries (filtering by client and completion status)
CREATE INDEX idx_client_tasks_client_completed ON client_tasks(client_id, completed);

-- Enable Row Level Security
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read all tasks
CREATE POLICY "Authenticated users can read client tasks"
    ON client_tasks
    FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: Authenticated users can insert tasks
CREATE POLICY "Authenticated users can insert client tasks"
    ON client_tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- RLS Policy: Authenticated users can update tasks
CREATE POLICY "Authenticated users can update client tasks"
    ON client_tasks
    FOR UPDATE
    TO authenticated
    USING (true);

-- RLS Policy: Authenticated users can delete tasks
CREATE POLICY "Authenticated users can delete client tasks"
    ON client_tasks
    FOR DELETE
    TO authenticated
    USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_client_tasks_updated_at
    BEFORE UPDATE ON client_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add check constraint: setup tasks should have due_date (soft constraint via application logic)
-- Note: Not enforced at database level to maintain flexibility
COMMENT ON COLUMN client_tasks.due_date IS 'Required for setup tasks, calculated for health_check tasks';
COMMENT ON COLUMN client_tasks.frequency IS 'Required for health_check tasks (daily, weekly, fortnightly, monthly)';
COMMENT ON COLUMN client_tasks.next_due_date IS 'Calculated next occurrence for recurring health_check tasks';
