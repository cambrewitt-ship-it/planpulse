-- Grant table privileges to authenticated and anon roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_health_status TO authenticated;
GRANT SELECT ON public.client_health_status TO anon;
