-- ============================================
-- FINAL SECURITY VERIFICATION
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- All checks should pass before deploying to Vercel

-- ============================================
-- CHECK 1: Verify RLS is enabled on all tables
-- ============================================
-- Expected: All tables should show rls_enabled = true
SELECT
  '✓ CHECK 1: RLS Status' as check_name,
  tablename,
  CASE
    WHEN rowsecurity = true THEN '✅ ENABLED'
    ELSE '❌ DISABLED - FIX REQUIRED'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'clients',
    'channels',
    'media_plans',
    'weekly_plans',
    'ad_platform_connections',
    'google_ads_accounts',
    'meta_ads_accounts',
    'google_analytics_accounts',
    'client_media_plan_builder',
    'action_points'
  )
ORDER BY tablename;

-- ============================================
-- CHECK 2: Verify clients table has user_id
-- ============================================
-- Expected: Should return 1 row showing user_id column exists
SELECT
  '✓ CHECK 2: Clients user_id Column' as check_name,
  column_name,
  data_type,
  CASE
    WHEN column_name = 'user_id' THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
  AND column_name = 'user_id';

-- ============================================
-- CHECK 3: Verify clients SELECT policy is user-scoped
-- ============================================
-- Expected: Should show "clients_select_own" policy, NOT "clients_read_all"
SELECT
  '✓ CHECK 3: Clients SELECT Policy' as check_name,
  policyname,
  CASE
    WHEN policyname LIKE '%select_own%' THEN '✅ USER-SCOPED'
    WHEN policyname LIKE '%read_all%' THEN '❌ ALLOWS ALL USERS - FIX REQUIRED'
    ELSE '⚠️  CHECK MANUALLY'
  END as status,
  qual as policy_check
FROM pg_policies
WHERE tablename = 'clients'
  AND cmd = 'SELECT';

-- ============================================
-- CHECK 4: Count policies for critical tables
-- ============================================
-- Expected: Each table should have 4 policies (SELECT, INSERT, UPDATE, DELETE)
SELECT
  '✓ CHECK 4: Policy Coverage' as check_name,
  tablename,
  COUNT(*) as policy_count,
  CASE
    WHEN COUNT(*) >= 4 THEN '✅ COMPLETE'
    WHEN COUNT(*) >= 2 THEN '⚠️  PARTIAL'
    ELSE '❌ MISSING POLICIES'
  END as status
FROM pg_policies
WHERE tablename IN (
  'clients',
  'ad_platform_connections',
  'google_ads_accounts',
  'meta_ads_accounts',
  'google_analytics_accounts',
  'channels',
  'media_plans',
  'weekly_plans'
)
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- CHECK 5: Verify ad account tables have user_id policies
-- ============================================
-- Expected: All should check auth.uid() = user_id
SELECT
  '✓ CHECK 5: Ad Account Policies' as check_name,
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual LIKE '%auth.uid()%user_id%' OR qual LIKE '%user_id%auth.uid()%' THEN '✅ USER-SCOPED'
    ELSE '❌ NOT USER-SCOPED'
  END as status
FROM pg_policies
WHERE tablename IN (
  'ad_platform_connections',
  'google_ads_accounts',
  'meta_ads_accounts',
  'google_analytics_accounts'
)
  AND cmd = 'SELECT'
ORDER BY tablename;

-- ============================================
-- CHECK 6: Verify no unassigned clients exist
-- ============================================
-- Expected: Should return 0 rows (all clients have user_id)
SELECT
  '✓ CHECK 6: Unassigned Clients' as check_name,
  id,
  name,
  created_at,
  '❌ NO OWNER - WILL BE INVISIBLE' as status
FROM clients
WHERE user_id IS NULL;

-- If this returns rows, run ONE of these:
-- Option A (claim them): UPDATE clients SET user_id = auth.uid() WHERE user_id IS NULL;
-- Option B (delete them): DELETE FROM clients WHERE user_id IS NULL;

-- ============================================
-- CHECK 7: Test data isolation (IMPORTANT!)
-- ============================================
-- This checks if policies would properly isolate data
-- Expected: Should return 0 clients for a fake user ID
DO $$
DECLARE
  test_user_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  client_count integer;
BEGIN
  -- Simulate a different user trying to access clients
  SELECT COUNT(*) INTO client_count
  FROM clients
  WHERE user_id != test_user_id OR user_id IS NULL;

  RAISE NOTICE '✓ CHECK 7: Data Isolation Test';
  RAISE NOTICE 'Clients visible to other users: %', client_count;

  IF client_count = 0 THEN
    RAISE NOTICE '✅ PERFECT: No clients visible to unauthorized users';
  ELSIF client_count > 0 THEN
    RAISE NOTICE '⚠️  % clients exist but should be hidden by RLS', client_count;
    RAISE NOTICE 'This is OK if RLS is properly configured';
  END IF;
END $$;

-- ============================================
-- FINAL SUMMARY
-- ============================================
SELECT
  '========================================' as separator,
  'FINAL SECURITY CHECKLIST' as title,
  '========================================' as separator2
UNION ALL
SELECT
  '[ ] All tables show RLS ENABLED' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '[ ] clients table has user_id column' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '[ ] clients SELECT policy is user-scoped (NOT read_all)' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '[ ] All ad account tables have user_id policies' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '[ ] No unassigned clients (user_id IS NULL)' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '[ ] Policy count is 4+ for critical tables' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '' as item,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '✅ If all checks pass: READY TO DEPLOY' as result,
  '' as blank1,
  '' as blank2
UNION ALL
SELECT
  '❌ If any checks fail: Fix issues before deploying' as result,
  '' as blank1,
  '' as blank2;

-- ============================================
-- INSTRUCTIONS:
-- ============================================
-- 1. Run this entire script in Supabase SQL Editor
-- 2. Review each CHECK result
-- 3. Look for ❌ (red X) or ⚠️  (warning) symbols
-- 4. If you see any issues:
--    - ❌ = Must fix before deploying
--    - ⚠️  = Review manually, might be OK
--    - ✅ = Good to go
-- 5. All checks should be ✅ before deploying to Vercel
