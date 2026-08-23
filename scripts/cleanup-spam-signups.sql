-- Cleanup for spam signups produced by the (now-deleted) verify-spotlight.mjs
-- QA script, which repeatedly submitted the real /auth/signup form with
-- tour-test-<timestamp>@example.com / tour-spot-<timestamp>@example.com addresses.
--
-- Run this yourself in the Supabase SQL editor (production project) — review
-- the SELECT output before running the DELETE. Most app tables reference
-- auth.users(id) ON DELETE CASCADE, so deleting the auth.users row cleans up
-- any dependent rows (e.g. clients) these throwaway accounts may have created.

-- 1) Preview: confirm this only matches the spam accounts before deleting anything
select id, email, created_at
from auth.users
where email like 'tour-test-%@example.com'
   or email like 'tour-spot-%@example.com'
order by created_at desc;

-- 2) Once the preview above looks right, delete them
delete from auth.users
where email like 'tour-test-%@example.com'
   or email like 'tour-spot-%@example.com';
