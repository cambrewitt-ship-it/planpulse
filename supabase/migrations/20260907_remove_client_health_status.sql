-- Migration: Remove the Red/Amber/Green client health traffic light
-- Purpose: "Client Health" (status IN ('green','amber','red')) is no longer
--          used as a measuring metric — it was hard to measure meaningfully
--          and has been replaced by manually reading spend pacing, CPA
--          trends, and Setup Auditor findings. This drops the status column
--          and renames the table away from "health" since that framing no
--          longer applies. The other cached columns (MTD spend used by the
--          Client Intelligence Hub for pacing, overdue task count, budget
--          pacing %) are genuinely still used and are kept, just renamed
--          off the old table.
-- Date: 2026-09-07

ALTER TABLE client_health_status RENAME TO client_spend_cache;

ALTER TABLE client_spend_cache DROP COLUMN status;

ALTER TABLE client_spend_cache RENAME COLUMN budget_health_percentage TO budget_pacing_percentage;

ALTER INDEX idx_client_health_status_client_id RENAME TO idx_client_spend_cache_client_id;
DROP INDEX IF EXISTS idx_client_health_status_status;

-- Note: the table's original pkey/unique/FK constraint names (auto-generated
-- as client_health_status_*) are left as-is — purely cosmetic, never
-- referenced by application code, and not worth the risk of guessing wrong
-- on names Postgres generated automatically at CREATE TABLE time.

DROP TRIGGER IF EXISTS update_client_health_status_updated_at ON client_spend_cache;
CREATE TRIGGER update_client_spend_cache_updated_at
    BEFORE UPDATE ON client_spend_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "client_health_status_owner_all" ON client_spend_cache;
CREATE POLICY "client_spend_cache_owner_all"
    ON client_spend_cache FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_spend_cache.client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_spend_cache.client_id AND c.user_id = auth.uid()));
