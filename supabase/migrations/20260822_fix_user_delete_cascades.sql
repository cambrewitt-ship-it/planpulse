-- Migration: Allow deleting an auth.users row from Supabase Studio
-- Bug: several FKs to auth.users(id) were created via ad-hoc SQL editor
--   scripts (SUPABASE_ADD_USER_ID_TO_CLIENTS.sql, FIX_CLIENT_DATA_ISOLATION.sql)
--   or inline CREATE TABLE statements with no ON DELETE clause, which
--   defaults to NO ACTION. Deleting a user from Auth > Users fails with a
--   foreign-key-violation as soon as that user owns a client, account
--   manager, share link, creative, demographic row, or intelligence-hub
--   record.
-- Fix: ownership columns (clients.user_id, account_managers.user_id,
--   client_ad_demographics.user_id) cascade — deleting the owning user
--   removes their data, same as deleting the account.  Audit-trail columns
--   (created_by/uploaded_by/saved_by/locked_by/set_by) go to SET NULL —
--   they just record who did something, not who owns the row, so the row
--   should survive with the attribution cleared.
-- Constraint names are looked up dynamically (not assumed) because these
-- FKs were added inconsistently outside of tracked migrations and may not
-- follow the default Postgres naming convention in every environment.
-- Date: 2026-08-22

DO $$
DECLARE
  t RECORD;
  fk_name text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('clients',                 'user_id',     'CASCADE'),
      ('account_managers',        'user_id',     'CASCADE'),
      ('client_ad_demographics',  'user_id',     'CASCADE'),
      ('client_hub_share_links',  'created_by',  'SET NULL'),
      ('client_hub_creatives',    'uploaded_by', 'SET NULL'),
      ('client_briefs',           'locked_by',   'SET NULL'),
      ('client_briefs',           'created_by',  'SET NULL'),
      ('client_brief_versions',   'saved_by',    'SET NULL'),
      ('client_documents',        'uploaded_by', 'SET NULL'),
      ('client_notes',            'created_by',  'SET NULL'),
      ('client_campaign_goals',   'set_by',      'SET NULL')
    ) AS x(table_name, column_name, delete_action)
  LOOP
    SELECT con.conname INTO fk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'auth.users'::regclass
      AND nsp.nspname = 'public'
      AND rel.relname = t.table_name
      AND att.attname = t.column_name
      AND array_length(con.conkey, 1) = 1;

    IF fk_name IS NULL THEN
      RAISE NOTICE 'No FK found for %.% referencing auth.users -- skipping', t.table_name, t.column_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t.table_name, fk_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',
      t.table_name, fk_name, t.column_name, t.delete_action
    );
  END LOOP;
END $$;

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- SELECT rel.relname AS table_name, att.attname AS column_name,
--        CASE con.confdeltype
--          WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
--          WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'd' THEN 'SET DEFAULT'
--        END AS on_delete
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
-- WHERE con.contype = 'f' AND con.confrelid = 'auth.users'::regclass
-- ORDER BY table_name, column_name;
