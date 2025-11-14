-- This migration is for reference only
-- The table already exists, use 20251113_add_client_id_to_ad_platform_connections.sql instead

-- create extension if not exists "uuid-ossp";

-- create table if not exists public.ad_platform_connections (
--     id uuid primary key default uuid_generate_v4(),
--     user_id uuid not null references auth.users (id) on delete cascade,
--     client_id uuid not null references public.clients (id) on delete cascade,
--     platform text not null check (platform in ('google-ads', 'facebook', 'linkedin-ads')),
--     connection_id text not null,
--     connection_status text not null check (connection_status in ('active', 'expired', 'error')),
--     created_at timestamptz not null default timezone('utc', now()),
--     updated_at timestamptz not null default timezone('utc', now()),
--     unique (client_id, platform)
-- );

-- create index if not exists ad_platform_connections_user_id_idx
--     on public.ad_platform_connections (user_id);

-- create index if not exists ad_platform_connections_client_id_idx
--     on public.ad_platform_connections (client_id);

-- alter table public.ad_platform_connections
--     enable row level security;

-- create policy "Allow select for own ad platform connections"
--     on public.ad_platform_connections
--     for select
--     using (auth.uid() = user_id);

-- create policy "Allow insert for own ad platform connections"
--     on public.ad_platform_connections
--     for insert
--     with check (auth.uid() = user_id);

-- create policy "Allow update for own ad platform connections"
--     on public.ad_platform_connections
--     for update
--     using (auth.uid() = user_id)
--     with check (auth.uid() = user_id);

-- create policy "Allow delete for own ad platform connections"
--     on public.ad_platform_connections
--     for delete
--     using (auth.uid() = user_id);

