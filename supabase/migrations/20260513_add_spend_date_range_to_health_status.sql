-- Add date range columns to client_health_status so the agency dashboard can
-- verify that the cached mtd_actual_spend covers the same period it's querying.
ALTER TABLE client_health_status
  ADD COLUMN IF NOT EXISTS spend_date_start TEXT,
  ADD COLUMN IF NOT EXISTS spend_date_end TEXT;
