-- Demo data for new-user onboarding.
-- A brand-new (empty) account gets a "Demo Client" auto-seeded with a live-
-- looking media plan, spend/CPA data, alerts, and to-dos, so a new user can
-- see the product's value before onboarding their own client. Seeding is
-- lazy and idempotent (see src/lib/demo-seed/seed-demo-data.ts) — these
-- columns just give it somewhere to flag "already seeded" and to track the
-- one-time "Getting Started" checklist shown alongside it.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS demo_data_seeded_at timestamptz;

ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS onboarding_checklist jsonb NOT NULL DEFAULT '{
  "viewed_agency_dashboard": false,
  "visited_demo_dashboard": false,
  "visited_demo_portal": false,
  "created_first_client": false
}'::jsonb;
