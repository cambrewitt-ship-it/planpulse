-- Add account_manager field to clients so clients can be assigned to AMs
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_manager TEXT;

-- Add assigned_to field to client_action_point_completions so individual
-- action point tasks can be assigned to specific account managers
ALTER TABLE client_action_point_completions ADD COLUMN IF NOT EXISTS assigned_to TEXT;
