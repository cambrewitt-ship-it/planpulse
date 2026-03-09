-- Migration: Seed action point templates for new non-digital channel types
-- These are standard setup and ongoing tasks for organic social, EDM, and OOH channels

-- Instagram (Organic) Action Points
INSERT INTO action_points (channel_type, text, category, reset_frequency, completed, created_at, updated_at)
VALUES
  ('Instagram (Organic)', 'Add channel to content calendar', 'SET UP', NULL, false, NOW(), NOW()),
  ('Instagram (Organic)', 'Confirm brand guidelines are documented', 'SET UP', NULL, false, NOW(), NOW()),
  ('Instagram (Organic)', 'Log this week''s posts', 'ONGOING', 'weekly', false, NOW(), NOW()),
  ('Instagram (Organic)', 'Review engagement on recent posts', 'ONGOING', 'weekly', false, NOW(), NOW());

-- Facebook (Organic) Action Points
INSERT INTO action_points (channel_type, text, category, reset_frequency, completed, created_at, updated_at)
VALUES
  ('Facebook (Organic)', 'Add channel to content calendar', 'SET UP', NULL, false, NOW(), NOW()),
  ('Facebook (Organic)', 'Confirm brand guidelines are documented', 'SET UP', NULL, false, NOW(), NOW()),
  ('Facebook (Organic)', 'Log this week''s posts', 'ONGOING', 'weekly', false, NOW(), NOW()),
  ('Facebook (Organic)', 'Review engagement on recent posts', 'ONGOING', 'weekly', false, NOW(), NOW());

-- LinkedIn (Organic) Action Points
INSERT INTO action_points (channel_type, text, category, reset_frequency, completed, created_at, updated_at)
VALUES
  ('LinkedIn (Organic)', 'Add channel to content calendar', 'SET UP', NULL, false, NOW(), NOW()),
  ('LinkedIn (Organic)', 'Confirm brand guidelines are documented', 'SET UP', NULL, false, NOW(), NOW()),
  ('LinkedIn (Organic)', 'Log this week''s posts', 'ONGOING', 'weekly', false, NOW(), NOW()),
  ('LinkedIn (Organic)', 'Review engagement on recent posts', 'ONGOING', 'weekly', false, NOW(), NOW());

-- EDM / Email Action Points
INSERT INTO action_points (channel_type, text, category, reset_frequency, completed, created_at, updated_at)
VALUES
  ('EDM / Email', 'Set up email platform and audience list', 'SET UP', NULL, false, NOW(), NOW()),
  ('EDM / Email', 'Create email template and brand styling', 'SET UP', NULL, false, NOW(), NOW()),
  ('EDM / Email', 'Log completed send', 'ONGOING', 'monthly', false, NOW(), NOW()),
  ('EDM / Email', 'Review open rate and click rate', 'ONGOING', 'monthly', false, NOW(), NOW());

-- OOH Action Points
INSERT INTO action_points (channel_type, text, category, reset_frequency, completed, created_at, updated_at)
VALUES
  ('OOH', 'Confirm booking with OOH vendor', 'SET UP', NULL, false, NOW(), NOW()),
  ('OOH', 'Submit artwork/creative by deadline', 'SET UP', NULL, false, NOW(), NOW()),
  ('OOH', 'Confirm proof of posting received', 'ONGOING', 'monthly', false, NOW(), NOW());
