create table if not exists user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  teams_webhook_url text,
  teams_bot_hmac_secret text,
  daily_briefing_enabled boolean not null default false,
  anomaly_alerts_enabled boolean not null default false,
  alert_snapshot jsonb,
  alert_snapshot_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table user_integrations enable row level security;

create policy "Users manage own integrations"
  on user_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
