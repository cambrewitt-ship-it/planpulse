-- Migration: Seed test data for Agency Dashboard
-- Purpose: Create realistic test data with varied health statuses
-- WARNING: This is test data only - safe to rollback
-- Date: 2026-02-09

-- =============================================================================
-- CLEANUP (if re-running)
-- =============================================================================

-- Note: Cascading deletes will clean up related records
DELETE FROM clients WHERE name IN (
  'TechCorp Solutions',
  'Retail Plus',
  'HealthCare Group',
  'BuildRight Construction',
  'FoodHub Delivery',
  'EduTech Academy',
  'FinServe Partners',
  'TravelNow Agency',
  'GreenEnergy Co',
  'FitLife Wellness'
);

-- =============================================================================
-- CREATE TEST CLIENTS
-- =============================================================================

-- Client 1: RED - Multiple overdue tasks, over budget
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000001', 'TechCorp Solutions', NOW(), NOW());

-- Client 2: RED - Setup incomplete, channel starts soon
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000002', 'Retail Plus', NOW(), NOW());

-- Client 3: RED - Severely over budget
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000003', 'HealthCare Group', NOW(), NOW());

-- Client 4: AMBER - 1 overdue task
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000004', 'BuildRight Construction', NOW(), NOW());

-- Client 5: AMBER - Multiple upcoming tasks
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000005', 'FoodHub Delivery', NOW(), NOW());

-- Client 6: AMBER - Slightly over budget
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000006', 'EduTech Academy', NOW(), NOW());

-- Client 7: AMBER - Setup incomplete but time remains
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000007', 'FinServe Partners', NOW(), NOW());

-- Client 8: GREEN - All healthy
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000008', 'TravelNow Agency', NOW(), NOW());

-- Client 9: GREEN - Perfect pacing
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000009', 'GreenEnergy Co', NOW(), NOW());

-- Client 10: GREEN - No issues
INSERT INTO clients (id, name, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000010', 'FitLife Wellness', NOW(), NOW());

-- =============================================================================
-- CREATE MEDIA PLANS
-- =============================================================================

-- Client 1: RED - Active plan
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Q1 2026 Campaign', '2026-01-15', '2026-03-31', 5000000, 'active', NOW(), NOW());

-- Client 2: RED - Starts in 2 days
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Launch Campaign', CURRENT_DATE + INTERVAL '2 days', '2026-04-30', 3000000, 'active', NOW(), NOW());

-- Client 3: RED - Over budget plan
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'Brand Awareness', '2026-01-01', '2026-06-30', 8000000, 'active', NOW(), NOW());

-- Client 4: AMBER
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', 'Construction Leads', '2026-02-01', '2026-05-31', 4500000, 'active', NOW(), NOW());

-- Client 5: AMBER
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000005', 'Food Delivery Push', '2026-02-01', '2026-04-30', 6000000, 'active', NOW(), NOW());

-- Client 6: AMBER
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000006', 'Student Enrollment', '2026-01-15', '2026-03-31', 3500000, 'active', NOW(), NOW());

-- Client 7: AMBER - Starts in 5 days
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000007', 'Financial Services', CURRENT_DATE + INTERVAL '5 days', '2026-06-30', 7000000, 'active', NOW(), NOW());

-- Client 8: GREEN
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000008', 'Travel Bookings', '2026-01-01', '2026-12-31', 10000000, 'active', NOW(), NOW());

-- Client 9: GREEN
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000009', 'Solar Solutions', '2026-02-01', '2026-07-31', 5500000, 'active', NOW(), NOW());

-- Client 10: GREEN
INSERT INTO media_plans (id, client_id, name, start_date, end_date, total_budget, status, created_at, updated_at)
VALUES 
  ('p1000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000010', 'Fitness Memberships', '2026-01-15', '2026-04-30', 4000000, 'active', NOW(), NOW());

-- =============================================================================
-- CREATE CHANNELS
-- =============================================================================

-- Client 1: RED - 3 channels
INSERT INTO channels (id, client_id, plan_id, channel, detail, type, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'Meta Ads', 'Facebook & Instagram', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'Google Search', 'Search campaigns', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'LinkedIn Ads', 'B2B targeting', 'paid', NOW());

-- Client 2: RED - 2 channels (starting soon)
INSERT INTO channels (id, client_id, plan_id, channel, detail, type, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'p1000000-0000-0000-0000-000000000002', 'Meta Ads', 'Retail campaigns', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'p1000000-0000-0000-0000-000000000002', 'Google Shopping', 'Product feeds', 'paid', NOW());

-- Client 3: RED - 2 channels
INSERT INTO channels (id, client_id, plan_id, channel, detail, type, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000003', 'p1000000-0000-0000-0000-000000000003', 'Meta Ads', 'Healthcare awareness', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000003', 'p1000000-0000-0000-0000-000000000003', 'Display Network', 'Banner ads', 'paid', NOW());

-- Clients 4-10: 2-3 channels each
INSERT INTO channels (id, client_id, plan_id, channel, detail, type, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000004', 'p1000000-0000-0000-0000-000000000004', 'Google Search', 'Construction leads', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000004', 'p1000000-0000-0000-0000-000000000004', 'Meta Ads', 'FB campaigns', 'paid', NOW()),
  
  ('ch100000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000005', 'p1000000-0000-0000-0000-000000000005', 'Meta Ads', 'Food delivery', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000005', 'p1000000-0000-0000-0000-000000000005', 'Google Search', 'Local search', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000005', 'p1000000-0000-0000-0000-000000000005', 'Display Network', 'Banner ads', 'paid', NOW()),
  
  ('ch100000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000006', 'p1000000-0000-0000-0000-000000000006', 'Meta Ads', 'Student targeting', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000006', 'p1000000-0000-0000-0000-000000000006', 'Google Search', 'Education keywords', 'paid', NOW()),
  
  ('ch100000-0000-0000-0000-000000000015', 'c1000000-0000-0000-0000-000000000007', 'p1000000-0000-0000-0000-000000000007', 'LinkedIn Ads', 'Finance professionals', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000016', 'c1000000-0000-0000-0000-000000000007', 'p1000000-0000-0000-0000-000000000007', 'Google Display', 'Financial sites', 'paid', NOW()),
  
  ('ch100000-0000-0000-0000-000000000017', 'c1000000-0000-0000-0000-000000000008', 'p1000000-0000-0000-0000-000000000008', 'Meta Ads', 'Travel packages', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000018', 'c1000000-0000-0000-0000-000000000008', 'p1000000-0000-0000-0000-000000000008', 'Google Search', 'Travel keywords', 'paid', NOW()),
  
  ('ch100000-0000-0000-0000-000000000019', 'c1000000-0000-0000-0000-000000000009', 'p1000000-0000-0000-0000-000000000009', 'Meta Ads', 'Solar solutions', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000020', 'c1000000-0000-0000-0000-000000000009', 'p1000000-0000-0000-0000-000000000009', 'Google Search', 'Solar search', 'paid', NOW()),
  
  ('ch100000-0000-0000-0000-000000000021', 'c1000000-0000-0000-0000-000000000010', 'p1000000-0000-0000-0000-000000000010', 'Meta Ads', 'Fitness targeting', 'paid', NOW()),
  ('ch100000-0000-0000-0000-000000000022', 'c1000000-0000-0000-0000-000000000010', 'p1000000-0000-0000-0000-000000000010', 'Google Search', 'Gym memberships', 'paid', NOW());

-- =============================================================================
-- CREATE WEEKLY PLANS (Sample weeks for budget tracking)
-- =============================================================================

-- Client 1: RED - OVER BUDGET (130% spent)
INSERT INTO weekly_plans (channel_id, week_commencing, week_number, budget_planned, budget_actual, posts_planned, posts_actual, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000001', '2026-01-20', 1, 50000, 65000, 10, 10, NOW()),
  ('ch100000-0000-0000-0000-000000000001', '2026-01-27', 2, 50000, 65000, 10, 11, NOW()),
  ('ch100000-0000-0000-0000-000000000002', '2026-01-20', 1, 60000, 78000, 0, 0, NOW()),
  ('ch100000-0000-0000-0000-000000000002', '2026-01-27', 2, 60000, 78000, 0, 0, NOW());

-- Client 3: RED - WAY OVER BUDGET (140% spent)
INSERT INTO weekly_plans (channel_id, week_commencing, week_number, budget_planned, budget_actual, posts_planned, posts_actual, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000006', '2026-01-06', 1, 100000, 140000, 15, 15, NOW()),
  ('ch100000-0000-0000-0000-000000000006', '2026-01-13', 2, 100000, 140000, 15, 16, NOW()),
  ('ch100000-0000-0000-0000-000000000007', '2026-01-06', 1, 80000, 112000, 0, 0, NOW());

-- Client 6: AMBER - Slightly over (115% spent)
INSERT INTO weekly_plans (channel_id, week_commencing, week_number, budget_planned, budget_actual, posts_planned, posts_actual, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000013', '2026-01-20', 1, 40000, 46000, 12, 12, NOW()),
  ('ch100000-0000-0000-0000-000000000013', '2026-01-27', 2, 40000, 46000, 12, 13, NOW());

-- Clients 8-10: GREEN - Good pacing (95-105%)
INSERT INTO weekly_plans (channel_id, week_commencing, week_number, budget_planned, budget_actual, posts_planned, posts_actual, created_at)
VALUES 
  ('ch100000-0000-0000-0000-000000000017', '2026-01-06', 1, 150000, 148000, 20, 20, NOW()),
  ('ch100000-0000-0000-0000-000000000017', '2026-01-13', 2, 150000, 152000, 20, 19, NOW()),
  ('ch100000-0000-0000-0000-000000000019', '2026-02-03', 1, 70000, 71000, 10, 10, NOW()),
  ('ch100000-0000-0000-0000-000000000021', '2026-01-20', 1, 60000, 59000, 15, 15, NOW());

-- =============================================================================
-- CREATE CLIENT TASKS
-- =============================================================================

-- Client 1: RED - Multiple overdue tasks (causes RED status)
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000001', 'ch100000-0000-0000-0000-000000000001', 'health_check', 'Review Meta Ads performance', NULL, CURRENT_DATE - INTERVAL '5 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000001', 'ch100000-0000-0000-0000-000000000002', 'health_check', 'Optimize Google Search keywords', NULL, CURRENT_DATE - INTERVAL '3 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000001', 'ch100000-0000-0000-0000-000000000003', 'setup', 'Complete LinkedIn targeting setup', NULL, CURRENT_DATE - INTERVAL '2 days', FALSE, NOW(), NOW());

-- Client 2: RED - Setup incomplete, channel starts in 2 days
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000002', 'ch100000-0000-0000-0000-000000000004', 'setup', 'Set up Meta pixel tracking', NULL, CURRENT_DATE + INTERVAL '1 day', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000002', 'ch100000-0000-0000-0000-000000000004', 'setup', 'Create ad creatives', NULL, CURRENT_DATE + INTERVAL '1 day', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000002', 'ch100000-0000-0000-0000-000000000005', 'setup', 'Configure product feed', NULL, CURRENT_DATE, FALSE, NOW(), NOW());

-- Client 3: RED - Over budget + overdue tasks
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000003', 'ch100000-0000-0000-0000-000000000006', 'health_check', 'Adjust budget allocation', NULL, CURRENT_DATE - INTERVAL '7 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000003', 'ch100000-0000-0000-0000-000000000007', 'health_check', 'Review display performance', NULL, CURRENT_DATE - INTERVAL '4 days', FALSE, NOW(), NOW());

-- Client 4: AMBER - 1 overdue task
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000004', 'ch100000-0000-0000-0000-000000000008', 'health_check', 'Weekly performance check', NULL, CURRENT_DATE - INTERVAL '1 day', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000004', 'ch100000-0000-0000-0000-000000000009', 'setup', 'Launch new ad sets', NULL, CURRENT_DATE + INTERVAL '5 days', TRUE, NOW(), NOW());

-- Client 5: AMBER - Multiple upcoming tasks (2+ due within 3 days)
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000005', 'ch100000-0000-0000-0000-000000000010', 'health_check', 'Review conversion rates', NULL, CURRENT_DATE + INTERVAL '2 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000005', 'ch100000-0000-0000-0000-000000000011', 'health_check', 'Update bid strategies', NULL, CURRENT_DATE + INTERVAL '2 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000005', 'ch100000-0000-0000-0000-000000000012', 'health_check', 'Refresh display creatives', NULL, CURRENT_DATE + INTERVAL '3 days', FALSE, NOW(), NOW());

-- Client 6: AMBER - Slightly over budget
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000006', 'ch100000-0000-0000-0000-000000000013', 'health_check', 'Weekly check-in', NULL, CURRENT_DATE + INTERVAL '5 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000006', 'ch100000-0000-0000-0000-000000000014', 'setup', 'Expand keyword list', NULL, CURRENT_DATE + INTERVAL '10 days', TRUE, NOW(), NOW());

-- Client 7: AMBER - Setup incomplete but 5 days until start
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000007', 'ch100000-0000-0000-0000-000000000015', 'setup', 'Complete LinkedIn audience setup', NULL, CURRENT_DATE + INTERVAL '4 days', FALSE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000007', 'ch100000-0000-0000-0000-000000000016', 'setup', 'Finalize display targeting', NULL, CURRENT_DATE + INTERVAL '4 days', FALSE, NOW(), NOW());

-- Client 8: GREEN - All tasks completed or well-timed
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000008', 'ch100000-0000-0000-0000-000000000017', 'setup', 'Initial setup complete', NULL, CURRENT_DATE - INTERVAL '10 days', TRUE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000008', 'ch100000-0000-0000-0000-000000000018', 'health_check', 'Monthly review', NULL, CURRENT_DATE + INTERVAL '15 days', FALSE, NOW(), NOW());

-- Client 9: GREEN - All good
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000009', 'ch100000-0000-0000-0000-000000000019', 'setup', 'Campaign setup complete', NULL, CURRENT_DATE - INTERVAL '5 days', TRUE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000009', 'ch100000-0000-0000-0000-000000000020', 'health_check', 'Quarterly review', NULL, CURRENT_DATE + INTERVAL '20 days', FALSE, NOW(), NOW());

-- Client 10: GREEN - Healthy status
INSERT INTO client_tasks (client_id, channel_id, task_type, title, description, due_date, completed, created_at, updated_at)
VALUES 
  ('c1000000-0000-0000-0000-000000000010', 'ch100000-0000-0000-0000-000000000021', 'setup', 'All setup tasks done', NULL, CURRENT_DATE - INTERVAL '8 days', TRUE, NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000010', 'ch100000-0000-0000-0000-000000000022', 'health_check', 'Upcoming check', NULL, CURRENT_DATE + INTERVAL '12 days', FALSE, NOW(), NOW());

-- =============================================================================
-- SUMMARY OF EXPECTED HEALTH STATUSES
-- =============================================================================

-- RED (3 clients):
-- 1. TechCorp Solutions - 3 overdue tasks, 130% over budget
-- 2. Retail Plus - Setup incomplete, starts in 2 days
-- 3. HealthCare Group - 2 overdue tasks, 140% over budget

-- AMBER (4 clients):
-- 4. BuildRight Construction - 1 overdue task
-- 5. FoodHub Delivery - 3 tasks due within 2-3 days
-- 6. EduTech Academy - 115% budget (slightly over)
-- 7. FinServe Partners - Setup incomplete but 5 days until start

-- GREEN (3 clients):
-- 8. TravelNow Agency - All healthy, good pacing
-- 9. GreenEnergy Co - Perfect pacing, no issues
-- 10. FitLife Wellness - All tasks on track

-- =============================================================================
-- NOTE: Health status calculation
-- =============================================================================

-- To calculate and populate client_health_status, you'll need to:
-- 1. Run the application's calculateClientHealth() function for each client
-- 2. Or call the API endpoint: POST /api/clients/[id]/health for each client
-- 3. Or implement a batch refresh: POST /api/agency/health/refresh-all

-- This migration creates the foundational data.
-- The health status will be calculated by the application logic when:
-- - The agency dashboard page loads (calculates on-the-fly if missing)
-- - The refresh button is clicked
-- - The auto-refresh interval runs

COMMENT ON TABLE clients IS 'Test data created by 20260209_seed_agency_dashboard_test_data.sql';
