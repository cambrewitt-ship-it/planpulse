-- Step 1: Check what policies currently exist on client_health_status
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'client_health_status'
AND schemaname = 'public';

-- Step 2: Check table privileges
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'client_health_status'
AND table_schema = 'public';

-- Step 3: Check if RLS is enabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'client_health_status';
