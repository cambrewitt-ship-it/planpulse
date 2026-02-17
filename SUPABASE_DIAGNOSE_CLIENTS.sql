-- ============================================
-- DIAGNOSE CLIENTS TABLE STRUCTURE
-- ============================================
-- Run this first to see what columns exist

-- Check the columns in clients table
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
ORDER BY ordinal_position;

-- Also check existing policies to understand the structure
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'clients';
