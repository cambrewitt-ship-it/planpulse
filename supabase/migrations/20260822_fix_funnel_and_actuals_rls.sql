-- Migration: Close cross-tenant RLS gaps missed by 20260819_fix_clients_data_isolation.sql
-- Tables affected: media_plan_funnels, funnel_metrics_cache, organic_social_actuals, edm_actuals
-- Before this migration, all four tables allowed any authenticated user to read/write
-- any other agency's data (USING (true) / auth.role() = 'authenticated').
--
-- media_plan_funnels has had a direct client_id column since
-- 20260222_add_client_id_to_funnels.sql, so this can use a plain ownership join
-- rather than the channel_ids JSONB/array matching the table used before that.

-- ====================
-- media_plan_funnels
-- ====================
DROP POLICY IF EXISTS "Users can view funnels" ON media_plan_funnels;
DROP POLICY IF EXISTS "Users can insert funnels" ON media_plan_funnels;
DROP POLICY IF EXISTS "Users can update funnels" ON media_plan_funnels;
DROP POLICY IF EXISTS "Users can delete funnels" ON media_plan_funnels;

CREATE POLICY "media_plan_funnels_owner_all"
  ON media_plan_funnels FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = media_plan_funnels.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = media_plan_funnels.client_id AND c.user_id = auth.uid()));

-- ====================
-- funnel_metrics_cache (scoped via funnel_id -> media_plan_funnels.client_id)
-- ====================
DROP POLICY IF EXISTS "Users can view funnel metrics cache" ON funnel_metrics_cache;
DROP POLICY IF EXISTS "Users can insert funnel metrics cache" ON funnel_metrics_cache;
DROP POLICY IF EXISTS "Users can update funnel metrics cache" ON funnel_metrics_cache;
DROP POLICY IF EXISTS "Users can delete funnel metrics cache" ON funnel_metrics_cache;

CREATE POLICY "funnel_metrics_cache_owner_all"
  ON funnel_metrics_cache FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM media_plan_funnels f
    JOIN clients c ON c.id = f.client_id
    WHERE f.id = funnel_metrics_cache.funnel_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM media_plan_funnels f
    JOIN clients c ON c.id = f.client_id
    WHERE f.id = funnel_metrics_cache.funnel_id AND c.user_id = auth.uid()
  ));

-- ====================
-- organic_social_actuals
-- ====================
DROP POLICY IF EXISTS "Authenticated users can read organic social actuals" ON organic_social_actuals;
DROP POLICY IF EXISTS "Authenticated users can insert organic social actuals" ON organic_social_actuals;
DROP POLICY IF EXISTS "Authenticated users can update organic social actuals" ON organic_social_actuals;
DROP POLICY IF EXISTS "Authenticated users can delete organic social actuals" ON organic_social_actuals;

CREATE POLICY "organic_social_actuals_owner_all"
  ON organic_social_actuals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = organic_social_actuals.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = organic_social_actuals.client_id AND c.user_id = auth.uid()));

-- ====================
-- edm_actuals
-- ====================
DROP POLICY IF EXISTS "Authenticated users can read edm actuals" ON edm_actuals;
DROP POLICY IF EXISTS "Authenticated users can insert edm actuals" ON edm_actuals;
DROP POLICY IF EXISTS "Authenticated users can update edm actuals" ON edm_actuals;
DROP POLICY IF EXISTS "Authenticated users can delete edm actuals" ON edm_actuals;

CREATE POLICY "edm_actuals_owner_all"
  ON edm_actuals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = edm_actuals.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = edm_actuals.client_id AND c.user_id = auth.uid()));

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- Run after applying to confirm no permissive policy survived:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE tablename IN ('media_plan_funnels','funnel_metrics_cache',
--   'organic_social_actuals','edm_actuals')
-- ORDER BY tablename, policyname;

-- ── ORPHANED ROWS ─────────────────────────────────────────────────────────
-- Funnels created before 20260222_add_client_id_to_funnels.sql may have a
-- NULL client_id and will become invisible to everyone under this policy.
-- Find and fix them before relying on this migration:
-- SELECT id, name, client_id, created_at FROM media_plan_funnels WHERE client_id IS NULL;
