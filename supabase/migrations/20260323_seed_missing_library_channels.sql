-- Seed missing media channel library entries and their action points / specs.
-- Run this once against your Supabase project.
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING where possible.

-- ─── 1. Insert library channel entries ───────────────────────────────────────
-- We use a fixed UUID per channel so re-runs are safe.

INSERT INTO media_channel_library (id, title, channel_type, notes)
VALUES
  ('a1000001-0000-0000-0000-000000000001', 'Twitter Ads',          'Twitter Ads',          'Paid social on X / Twitter.'),
  ('a1000001-0000-0000-0000-000000000002', 'YouTube Ads',          'YouTube Ads',          'Skippable / non-skippable video ads on YouTube.'),
  ('a1000001-0000-0000-0000-000000000003', 'Snapchat Ads',         'Snapchat Ads',         'Snap Ads, Story Ads and Collection Ads.'),
  ('a1000001-0000-0000-0000-000000000004', 'Instagram (Organic)',  'Instagram (Organic)',  'Organic Instagram content strategy.'),
  ('a1000001-0000-0000-0000-000000000005', 'Facebook (Organic)',   'Facebook (Organic)',   'Organic Facebook page management.'),
  ('a1000001-0000-0000-0000-000000000006', 'LinkedIn (Organic)',   'LinkedIn (Organic)',   'Organic LinkedIn company page content.'),
  ('a1000001-0000-0000-0000-000000000007', 'EDM / Email',          'EDM / Email',          'Email marketing and automated flows.'),
  ('a1000001-0000-0000-0000-000000000008', 'OOH',                  'OOH',                  'Out-of-home: billboards, street furniture, transit.')
ON CONFLICT (id) DO NOTHING;


-- ─── 2. Action points ────────────────────────────────────────────────────────
-- SET UP action points (days_before_live_due = days before campaign launch)
-- HEALTH CHECK action points (frequency-based recurring checks)

INSERT INTO action_points (channel_type, text, category, days_before_live_due, frequency, completed)
VALUES
  -- Twitter Ads – SET UP
  ('Twitter Ads', 'Create Twitter Ads account and grant agency access', 'SET UP', 14, NULL, false),
  ('Twitter Ads', 'Define campaign objective and target audience segments', 'SET UP', 10, NULL, false),
  ('Twitter Ads', 'Upload creative assets (images / videos) and copy', 'SET UP', 7, NULL, false),
  ('Twitter Ads', 'Set up conversion tracking / website tag', 'SET UP', 7, NULL, false),
  ('Twitter Ads', 'Configure billing and daily budget caps', 'SET UP', 3, NULL, false),
  -- Twitter Ads – HEALTH CHECK
  ('Twitter Ads', 'Review CTR and engagement rate vs benchmark', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Twitter Ads', 'Check spend pacing against monthly budget', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Twitter Ads', 'Review audience performance and adjust targeting', 'HEALTH CHECK', NULL, 'fortnightly', false),

  -- YouTube Ads – SET UP
  ('YouTube Ads', 'Link YouTube channel to Google Ads account', 'SET UP', 14, NULL, false),
  ('YouTube Ads', 'Upload video creatives and add bumper / skippable variants', 'SET UP', 10, NULL, false),
  ('YouTube Ads', 'Configure video action campaign goals and bidding', 'SET UP', 7, NULL, false),
  ('YouTube Ads', 'Set up brand safety exclusions (sensitive categories, placements)', 'SET UP', 5, NULL, false),
  ('YouTube Ads', 'Verify conversion tracking via GA4 / Google Ads tag', 'SET UP', 3, NULL, false),
  -- YouTube Ads – HEALTH CHECK
  ('YouTube Ads', 'Review view-through rate (VTR) and cost-per-view (CPV)', 'HEALTH CHECK', NULL, 'weekly', false),
  ('YouTube Ads', 'Check placement report and exclude low-quality placements', 'HEALTH CHECK', NULL, 'fortnightly', false),
  ('YouTube Ads', 'Review frequency capping and audience overlap', 'HEALTH CHECK', NULL, 'monthly', false),

  -- Snapchat Ads – SET UP
  ('Snapchat Ads', 'Create Snapchat Business Manager and add agency access', 'SET UP', 14, NULL, false),
  ('Snapchat Ads', 'Install Snap Pixel and verify events firing', 'SET UP', 10, NULL, false),
  ('Snapchat Ads', 'Design vertical creative assets (9:16 ratio)', 'SET UP', 7, NULL, false),
  ('Snapchat Ads', 'Build audience segments (custom, lookalike)', 'SET UP', 5, NULL, false),
  ('Snapchat Ads', 'Configure campaign budget and bid strategy', 'SET UP', 3, NULL, false),
  -- Snapchat Ads – HEALTH CHECK
  ('Snapchat Ads', 'Review swipe-up rate and cost-per-swipe', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Snapchat Ads', 'Check story completion rate vs industry benchmark', 'HEALTH CHECK', NULL, 'fortnightly', false),

  -- Instagram (Organic) – SET UP
  ('Instagram (Organic)', 'Confirm brand content pillars and posting schedule', 'SET UP', 7, NULL, false),
  ('Instagram (Organic)', 'Audit existing profile (bio, highlight covers, grid aesthetic)', 'SET UP', 5, NULL, false),
  ('Instagram (Organic)', 'Prepare first 2 weeks of content in scheduling tool', 'SET UP', 3, NULL, false),
  -- Instagram (Organic) – HEALTH CHECK
  ('Instagram (Organic)', 'Review reach, impressions and follower growth', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Instagram (Organic)', 'Check top-performing posts and replicate content format', 'HEALTH CHECK', NULL, 'fortnightly', false),
  ('Instagram (Organic)', 'Audit hashtag strategy and Story engagement', 'HEALTH CHECK', NULL, 'monthly', false),

  -- Facebook (Organic) – SET UP
  ('Facebook (Organic)', 'Confirm admin access to Facebook Page', 'SET UP', 7, NULL, false),
  ('Facebook (Organic)', 'Update page information (About, CTA button, cover image)', 'SET UP', 5, NULL, false),
  ('Facebook (Organic)', 'Schedule first 2 weeks of posts via Meta Business Suite', 'SET UP', 3, NULL, false),
  -- Facebook (Organic) – HEALTH CHECK
  ('Facebook (Organic)', 'Review post reach and engagement rate', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Facebook (Organic)', 'Audit page insights: demographics and peak times', 'HEALTH CHECK', NULL, 'monthly', false),

  -- LinkedIn (Organic) – SET UP
  ('LinkedIn (Organic)', 'Confirm super-admin access to LinkedIn Company Page', 'SET UP', 7, NULL, false),
  ('LinkedIn (Organic)', 'Update company page branding and About section', 'SET UP', 5, NULL, false),
  ('LinkedIn (Organic)', 'Prepare editorial calendar aligned to brand thought leadership', 'SET UP', 3, NULL, false),
  -- LinkedIn (Organic) – HEALTH CHECK
  ('LinkedIn (Organic)', 'Review impressions, reactions, and follower growth', 'HEALTH CHECK', NULL, 'weekly', false),
  ('LinkedIn (Organic)', 'Assess employee advocacy engagement', 'HEALTH CHECK', NULL, 'monthly', false),

  -- EDM / Email – SET UP
  ('EDM / Email', 'Confirm ESP access (e.g., Klaviyo, Mailchimp, HubSpot)', 'SET UP', 14, NULL, false),
  ('EDM / Email', 'Verify domain authentication (SPF, DKIM, DMARC)', 'SET UP', 10, NULL, false),
  ('EDM / Email', 'Build and test email templates (desktop + mobile)', 'SET UP', 7, NULL, false),
  ('EDM / Email', 'Segment subscriber list and set up suppression rules', 'SET UP', 5, NULL, false),
  ('EDM / Email', 'Configure welcome / abandoned-cart automation flows', 'SET UP', 5, NULL, false),
  ('EDM / Email', 'Send test sends and QA across clients (Litmus / Email on Acid)', 'SET UP', 2, NULL, false),
  -- EDM / Email – HEALTH CHECK
  ('EDM / Email', 'Review open rate, click rate, and unsubscribe rate', 'HEALTH CHECK', NULL, 'weekly', false),
  ('EDM / Email', 'Monitor deliverability and spam complaint rate', 'HEALTH CHECK', NULL, 'fortnightly', false),
  ('EDM / Email', 'Audit automation flow performance and update sequences', 'HEALTH CHECK', NULL, 'monthly', false),

  -- OOH – SET UP
  ('OOH', 'Confirm site locations and formats with media owner', 'SET UP', 21, NULL, false),
  ('OOH', 'Brief creative studio on OOH specs (resolution, bleed, safe zones)', 'SET UP', 14, NULL, false),
  ('OOH', 'Submit artwork files by media owner deadline', 'SET UP', 7, NULL, false),
  ('OOH', 'Obtain proof-of-posting photos from media owner', 'SET UP', 0, NULL, false),
  -- OOH – HEALTH CHECK
  ('OOH', 'Confirm all panels are live and artwork is displaying correctly', 'HEALTH CHECK', NULL, 'weekly', false),
  ('OOH', 'Review brand-lift or foot-traffic attribution report (if available)', 'HEALTH CHECK', NULL, 'monthly', false)
ON CONFLICT DO NOTHING;


-- ─── 3. Media channel specs ───────────────────────────────────────────────────
-- Linked to the library entry IDs inserted above.

INSERT INTO media_channel_specs (media_channel_library_id, spec_text)
VALUES
  -- Twitter Ads
  ('a1000001-0000-0000-0000-000000000001', 'Image ads: 1200×628px or 800×800px, max 5MB, JPG/PNG'),
  ('a1000001-0000-0000-0000-000000000001', 'Video ads: 1280×720px (16:9), max 1GB, MP4/MOV, up to 2m20s'),
  ('a1000001-0000-0000-0000-000000000001', 'Headline: max 70 characters; Tweet copy: max 280 characters'),
  ('a1000001-0000-0000-0000-000000000001', 'Card title: max 70 characters; Website URL required for website cards'),

  -- YouTube Ads
  ('a1000001-0000-0000-0000-000000000002', 'Skippable in-stream: min 12s, max 3min; skip after 5s; 16:9, 1920×1080px recommended'),
  ('a1000001-0000-0000-0000-000000000002', 'Non-skippable in-stream: 15–20s; 16:9, 1920×1080px; max 200MB MP4/MOV'),
  ('a1000001-0000-0000-0000-000000000002', 'Bumper ads: max 6s, non-skippable, 16:9'),
  ('a1000001-0000-0000-0000-000000000002', 'Video discovery: thumbnail 1280×720px, title max 100 chars, description max 35 chars per line'),

  -- Snapchat Ads
  ('a1000001-0000-0000-0000-000000000003', 'Single image/video: 1080×1920px (9:16), max 5MB image / 1GB video'),
  ('a1000001-0000-0000-0000-000000000003', 'Video length: 3–180s; MP4 or MOV; H.264 codec; max 30fps'),
  ('a1000001-0000-0000-0000-000000000003', 'Brand name: max 25 chars; Headline: max 34 chars; CTA: choose from preset list'),
  ('a1000001-0000-0000-0000-000000000003', 'Safe zone: keep key content 150px from top and bottom edges'),

  -- Instagram (Organic)
  ('a1000001-0000-0000-0000-000000000004', 'Feed image: 1080×1080px (square), 1080×1350px (portrait), 1080×566px (landscape)'),
  ('a1000001-0000-0000-0000-000000000004', 'Reel: 1080×1920px (9:16), max 90s, MP4/MOV, max 4GB'),
  ('a1000001-0000-0000-0000-000000000004', 'Story: 1080×1920px, max 15s per clip; interactive stickers available'),
  ('a1000001-0000-0000-0000-000000000004', 'Caption: max 2,200 chars; hashtags: up to 30 per post'),

  -- Facebook (Organic)
  ('a1000001-0000-0000-0000-000000000005', 'Link post image: 1200×628px recommended'),
  ('a1000001-0000-0000-0000-000000000005', 'Video: up to 240min, max 4GB; MP4/MOV; 1280×720px minimum'),
  ('a1000001-0000-0000-0000-000000000005', 'Reel: 1080×1920px (9:16), max 90s'),
  ('a1000001-0000-0000-0000-000000000005', 'Caption: max 63,206 chars (algorithm favours shorter copy ~80 chars)'),

  -- LinkedIn (Organic)
  ('a1000001-0000-0000-0000-000000000006', 'Post image: 1200×628px (landscape) or 1080×1080px (square), max 5MB'),
  ('a1000001-0000-0000-0000-000000000006', 'Video: 256×144px to 4096×2304px, max 5GB, max 15min, MP4'),
  ('a1000001-0000-0000-0000-000000000006', 'Document (carousel): PDF/PPT/DOC, max 300 pages, max 100MB'),
  ('a1000001-0000-0000-0000-000000000006', 'Post text: up to 3,000 chars; first ~150 chars visible before "see more"'),

  -- EDM / Email
  ('a1000001-0000-0000-0000-000000000007', 'Email width: 600px standard; render-test across Outlook, Gmail, Apple Mail'),
  ('a1000001-0000-0000-0000-000000000007', 'Subject line: 40–60 chars recommended; preheader: 85–100 chars'),
  ('a1000001-0000-0000-0000-000000000007', 'Images: max 1MB each; always include ALT text; avoid image-only emails'),
  ('a1000001-0000-0000-0000-000000000007', 'GIF: max 1MB; ensure first frame communicates message without animation'),
  ('a1000001-0000-0000-0000-000000000007', 'Plain-text version required alongside HTML for deliverability'),

  -- OOH
  ('a1000001-0000-0000-0000-000000000008', 'Billboards (48-sheet): 3048×1524mm print-ready PDF, min 150dpi at final size'),
  ('a1000001-0000-0000-0000-000000000008', 'Street furniture (6-sheet): 1185×1750mm, min 150dpi, 3–5mm bleed'),
  ('a1000001-0000-0000-0000-000000000008', 'Digital OOH: confirm pixel dimensions with media owner; typically 1920×1080px or 1080×1920px'),
  ('a1000001-0000-0000-0000-000000000008', 'Copy rule: max 7 words for roadside formats (2s viewing time)'),
  ('a1000001-0000-0000-0000-000000000008', 'Colour mode: CMYK for print; RGB for digital screens; embed all fonts')
ON CONFLICT DO NOTHING;
