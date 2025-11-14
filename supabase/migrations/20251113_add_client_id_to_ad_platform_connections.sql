-- Add client_id column to existing ad_platform_connections table
alter table public.ad_platform_connections
    add column if not exists client_id uuid references public.clients (id) on delete cascade;

-- Drop the old unique constraint if it exists
alter table public.ad_platform_connections
    drop constraint if exists ad_platform_connections_user_id_platform_key;

-- Add new unique constraint on client_id and platform
alter table public.ad_platform_connections
    add constraint ad_platform_connections_client_id_platform_key 
    unique (client_id, platform);

-- Add index on client_id for performance
create index if not exists ad_platform_connections_client_id_idx
    on public.ad_platform_connections (client_id);

-- Update the connection_status column name if needed (it might be 'status' in your existing table)
-- Uncomment the line below if your column is named 'status' instead of 'connection_status'
-- alter table public.ad_platform_connections rename column status to connection_status;

