-- Migration: Add mtd_actual_spend to client_health_status
-- Purpose: Cache the MTD actual spend computed by new-client-dashboard so agency
--          dashboard can mirror the exact same number without recalculation.
-- Date: 2026-02-24

ALTER TABLE client_health_status
  ADD COLUMN IF NOT EXISTS mtd_actual_spend NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS mtd_actual_spend_updated_at TIMESTAMPTZ;
