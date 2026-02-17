-- Migration: Seed pre-loaded SET UP action points for all media channel types
-- These are standard setup tasks for each channel type

-- Delete existing action points to avoid duplicates (for idempotency)
DELETE FROM action_points WHERE category = 'SET UP';

-- Meta Ads SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('Meta Ads', 'Connect Meta Business Manager account', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Install Meta Pixel on website', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Set up conversion tracking events', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Configure audience targeting parameters', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Create custom audiences from existing customer data', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Set up lookalike audiences', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Configure billing and payment method', 'SET UP', false, NOW(), NOW()),
  ('Meta Ads', 'Set daily/lifetime budget caps', 'SET UP', false, NOW(), NOW());

-- Google Ads SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('Google Ads', 'Connect Google Ads account', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Install Google Ads conversion tracking tag', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Link Google Analytics to Google Ads', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Set up conversion actions and goals', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Configure billing and payment method', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Set up remarketing audiences', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Define campaign structure and ad groups', 'SET UP', false, NOW(), NOW()),
  ('Google Ads', 'Set up negative keyword lists', 'SET UP', false, NOW(), NOW());

-- Google Search SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('Google Search', 'Complete keyword research and planning', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Set up search campaign structure', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Create ad copy variations for A/B testing', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Configure location and language targeting', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Set up ad extensions (sitelinks, callouts, structured snippets)', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Configure bid strategy and budget', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Import and organize negative keywords', 'SET UP', false, NOW(), NOW()),
  ('Google Search', 'Set up conversion tracking', 'SET UP', false, NOW(), NOW());

-- Google Shopping SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('Google Shopping', 'Set up Google Merchant Center account', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Link Merchant Center to Google Ads', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Upload product feed to Merchant Center', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Verify and claim website URL', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Configure product data specifications', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Set up Shopping campaign in Google Ads', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Configure product groups and bidding', 'SET UP', false, NOW(), NOW()),
  ('Google Shopping', 'Set up conversion tracking for purchases', 'SET UP', false, NOW(), NOW());

-- LinkedIn Ads SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('LinkedIn Ads', 'Connect LinkedIn Campaign Manager account', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Install LinkedIn Insight Tag on website', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Set up conversion tracking', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Configure audience targeting (job titles, industries, company size)', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Create matched audiences from contact lists', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Configure billing and payment method', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Set campaign objectives and budget', 'SET UP', false, NOW(), NOW()),
  ('LinkedIn Ads', 'Set up lead gen forms (if applicable)', 'SET UP', false, NOW(), NOW());

-- TikTok Ads SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('TikTok Ads', 'Create TikTok Ads Manager account', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Install TikTok Pixel on website', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Set up conversion tracking events', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Configure audience targeting parameters', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Create custom audiences', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Configure billing and payment method', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Set campaign objectives and budget', 'SET UP', false, NOW(), NOW()),
  ('TikTok Ads', 'Prepare creative assets in TikTok format', 'SET UP', false, NOW(), NOW());

-- Instagram Ads SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('Instagram Ads', 'Connect Instagram Business account to Meta Business Manager', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Install Meta Pixel for tracking', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Set up conversion tracking', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Configure audience targeting', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Create custom and lookalike audiences', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Configure billing and payment method', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Set up Instagram Shopping (if applicable)', 'SET UP', false, NOW(), NOW()),
  ('Instagram Ads', 'Prepare creative assets in Instagram formats', 'SET UP', false, NOW(), NOW());

-- Display Network SET UP Action Points
INSERT INTO action_points (channel_type, text, category, completed, created_at, updated_at)
VALUES
  ('Display Network', 'Set up Google Display Network campaign', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Install conversion tracking tag', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Configure audience targeting (contextual, placement, audience)', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Create responsive display ads', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Upload image and video creative assets', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Set up remarketing lists', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Configure placement exclusions', 'SET UP', false, NOW(), NOW()),
  ('Display Network', 'Set campaign budget and bidding strategy', 'SET UP', false, NOW(), NOW());
