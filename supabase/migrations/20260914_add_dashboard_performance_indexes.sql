-- The /dashboard (agency clients list) endpoint filters clients by user_id
-- on every request, and it's also the exact column the clients_select_own
-- RLS policy filters on (auth.uid() = user_id) — but clients.user_id has
-- never had an index (unlike account_managers.user_id, which does). Without
-- it, every clients access is a sequential scan across all agencies' rows.
--
-- ad_performance_metrics already has single-column indexes (client_id,
-- platform, date, etc.) but nothing composite, even though nearly every
-- per-client query in goals/route.ts and perf-series.ts filters by
-- client_id + platform + a date range together.
-- Date: 2026-09-14

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_client_platform_date
  ON ad_performance_metrics(client_id, platform, date DESC);
