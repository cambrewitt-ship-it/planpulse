-- Migration: Add days_before_live_due column to action_points table
-- This column specifies how many days before campaign goes live the action point should be due
-- Only relevant for SET UP category action points

-- Step 1: Add the days_before_live_due column
ALTER TABLE action_points
ADD COLUMN IF NOT EXISTS days_before_live_due INTEGER;

-- Step 2: Update all existing SET UP action points with days_before_live_due values
-- Meta Ads
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Connect Meta Business Manager account' THEN 7
  WHEN 'Install Meta Pixel on website' THEN 5
  WHEN 'Set up conversion tracking events' THEN 4
  WHEN 'Configure audience targeting parameters' THEN 3
  WHEN 'Create custom audiences from existing customer data' THEN 3
  WHEN 'Set up lookalike audiences' THEN 2
  WHEN 'Configure billing and payment method' THEN 7
  WHEN 'Set daily/lifetime budget caps' THEN 2
END
WHERE channel_type = 'Meta Ads' AND category = 'SET UP';

-- Google Ads
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Connect Google Ads account' THEN 7
  WHEN 'Install Google Ads conversion tracking tag' THEN 5
  WHEN 'Link Google Analytics to Google Ads' THEN 4
  WHEN 'Set up conversion actions and goals' THEN 4
  WHEN 'Configure billing and payment method' THEN 7
  WHEN 'Set up remarketing audiences' THEN 3
  WHEN 'Define campaign structure and ad groups' THEN 2
  WHEN 'Set up negative keyword lists' THEN 2
END
WHERE channel_type = 'Google Ads' AND category = 'SET UP';

-- Google Search
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Complete keyword research and planning' THEN 7
  WHEN 'Set up search campaign structure' THEN 2
  WHEN 'Create ad copy variations for A/B testing' THEN 5
  WHEN 'Configure location and language targeting' THEN 2
  WHEN 'Set up ad extensions (sitelinks, callouts, structured snippets)' THEN 3
  WHEN 'Configure bid strategy and budget' THEN 2
  WHEN 'Import and organize negative keywords' THEN 2
  WHEN 'Set up conversion tracking' THEN 4
END
WHERE channel_type = 'Google Search' AND category = 'SET UP';

-- Google Shopping
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Set up Google Merchant Center account' THEN 10
  WHEN 'Link Merchant Center to Google Ads' THEN 5
  WHEN 'Upload product feed to Merchant Center' THEN 7
  WHEN 'Verify and claim website URL' THEN 7
  WHEN 'Configure product data specifications' THEN 5
  WHEN 'Set up Shopping campaign in Google Ads' THEN 2
  WHEN 'Configure product groups and bidding' THEN 2
  WHEN 'Set up conversion tracking for purchases' THEN 4
END
WHERE channel_type = 'Google Shopping' AND category = 'SET UP';

-- LinkedIn Ads
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Connect LinkedIn Campaign Manager account' THEN 7
  WHEN 'Install LinkedIn Insight Tag on website' THEN 5
  WHEN 'Set up conversion tracking' THEN 4
  WHEN 'Configure audience targeting (job titles, industries, company size)' THEN 3
  WHEN 'Create matched audiences from contact lists' THEN 3
  WHEN 'Configure billing and payment method' THEN 7
  WHEN 'Set campaign objectives and budget' THEN 2
  WHEN 'Set up lead gen forms (if applicable)' THEN 3
END
WHERE channel_type = 'LinkedIn Ads' AND category = 'SET UP';

-- TikTok Ads
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Create TikTok Ads Manager account' THEN 7
  WHEN 'Install TikTok Pixel on website' THEN 5
  WHEN 'Set up conversion tracking events' THEN 4
  WHEN 'Configure audience targeting parameters' THEN 3
  WHEN 'Create custom audiences' THEN 3
  WHEN 'Configure billing and payment method' THEN 7
  WHEN 'Set campaign objectives and budget' THEN 2
  WHEN 'Prepare creative assets in TikTok format' THEN 5
END
WHERE channel_type = 'TikTok Ads' AND category = 'SET UP';

-- Instagram Ads
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Connect Instagram Business account to Meta Business Manager' THEN 7
  WHEN 'Install Meta Pixel for tracking' THEN 5
  WHEN 'Set up conversion tracking' THEN 4
  WHEN 'Configure audience targeting' THEN 3
  WHEN 'Create custom and lookalike audiences' THEN 2
  WHEN 'Configure billing and payment method' THEN 7
  WHEN 'Set up Instagram Shopping (if applicable)' THEN 5
  WHEN 'Prepare creative assets in Instagram formats' THEN 5
END
WHERE channel_type = 'Instagram Ads' AND category = 'SET UP';

-- Display Network
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Set up Google Display Network campaign' THEN 2
  WHEN 'Install conversion tracking tag' THEN 5
  WHEN 'Configure audience targeting (contextual, placement, audience)' THEN 3
  WHEN 'Create responsive display ads' THEN 5
  WHEN 'Upload image and video creative assets' THEN 5
  WHEN 'Set up remarketing lists' THEN 3
  WHEN 'Configure placement exclusions' THEN 2
  WHEN 'Set campaign budget and bidding strategy' THEN 2
END
WHERE channel_type = 'Display Network' AND category = 'SET UP';

-- Instagram (Organic)
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Add channel to content calendar' THEN 7
  WHEN 'Confirm brand guidelines are documented' THEN 7
END
WHERE channel_type = 'Instagram (Organic)' AND category = 'SET UP';

-- Facebook (Organic)
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Add channel to content calendar' THEN 7
  WHEN 'Confirm brand guidelines are documented' THEN 7
END
WHERE channel_type = 'Facebook (Organic)' AND category = 'SET UP';

-- LinkedIn (Organic)
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Add channel to content calendar' THEN 7
  WHEN 'Confirm brand guidelines are documented' THEN 7
END
WHERE channel_type = 'LinkedIn (Organic)' AND category = 'SET UP';

-- EDM / Email
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Set up email platform and audience list' THEN 7
  WHEN 'Create email template and brand styling' THEN 5
END
WHERE channel_type = 'EDM / Email' AND category = 'SET UP';

-- OOH
UPDATE action_points
SET days_before_live_due = CASE text
  WHEN 'Confirm booking with OOH vendor' THEN 14
  WHEN 'Submit artwork/creative by deadline' THEN 10
END
WHERE channel_type = 'OOH' AND category = 'SET UP';

-- Step 2b: For any remaining SET UP action points without a value, apply a sensible default
-- This ensures EVERY existing SET UP template has a days_before_live_due value
UPDATE action_points
SET days_before_live_due = 2
WHERE category = 'SET UP' AND days_before_live_due IS NULL;

-- Step 3: Add constraint - only SET UP category should have a non-null, non-negative value
ALTER TABLE action_points
DROP CONSTRAINT IF EXISTS action_points_days_before_live_check;

ALTER TABLE action_points
ADD CONSTRAINT action_points_days_before_live_check
CHECK (
  (category = 'SET UP' AND days_before_live_due IS NOT NULL AND days_before_live_due >= 0)
  OR (category != 'SET UP' AND days_before_live_due IS NULL)
);
