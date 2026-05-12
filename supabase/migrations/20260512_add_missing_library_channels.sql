-- Migration: Add missing media channels to library and fix Display Ads naming
-- Channels present in the Media Plan Builder but missing from the Library.

-- Fix broken trigger function: the live DB version incorrectly tries to UPDATE
-- public.media_channels (a table that doesn't exist). Replace it with the correct
-- simple version that only stamps updated_at on the row being modified.
CREATE OR REPLACE FUNCTION update_media_channel_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix naming: rename "Display Network" to "Display Ads" to match the builder
UPDATE media_channel_library
SET channel_type = 'Display Ads', title = 'Display Ads'
WHERE channel_type = 'Display Network';

-- Insert missing channels (idempotent via fixed UUIDs)
INSERT INTO media_channel_library (id, title, channel_type, notes)
VALUES
  ('b2000001-0000-0000-0000-000000000001', 'Native Ads',  'Native Ads',  'Sponsored content ads that match the look and feel of the surrounding editorial content. Served across premium publisher networks (e.g. Taboola, Outbrain, Yahoo Gemini). Effective for upper-to-mid funnel awareness and content distribution.'),
  ('b2000001-0000-0000-0000-000000000002', 'Reddit Ads',  'Reddit Ads',  'Promoted posts and display ads across Reddit communities (subreddits). Reach highly engaged niche audiences with interest- and keyword-based targeting. Supports image, video, and carousel formats.'),
  ('b2000001-0000-0000-0000-000000000003', 'Radio',       'Radio',       'Audio advertising on AM/FM broadcast radio and digital radio (DAB+). Effective for mass-reach brand awareness in local and national markets. Includes spot ads, sponsorships, and live reads.'),
  ('b2000001-0000-0000-0000-000000000004', 'Linear TV',   'Linear TV',   'Traditional broadcast and cable television advertising. Reach broad audiences with high-impact video spots across free-to-air and pay-TV channels. Includes spots, sponsorships, and infomercials.'),
  ('b2000001-0000-0000-0000-000000000005', 'SVOD',        'SVOD',        'Subscription video on demand advertising (e.g. Foxtel, Stan, Binge). Reach engaged streaming audiences with pre-roll and mid-roll video ads. Offers demographic and behavioural targeting with high completion rates.'),
  ('b2000001-0000-0000-0000-000000000006', 'BVOD',        'BVOD',        'Broadcaster video on demand advertising (e.g. 9Now, 7plus, 10 Play, ABC iview). Stream targeted video ads alongside premium broadcaster content. Combines the reach of linear TV with digital targeting and measurement.')
ON CONFLICT (id) DO NOTHING;

-- ─── Action points for new channels ──────────────────────────────────────────

INSERT INTO action_points (channel_type, text, category, days_before_live_due, frequency, completed)
VALUES
  -- Native Ads – SET UP
  ('Native Ads', 'Set up account with native ad platform (e.g. Taboola, Outbrain)', 'SET UP', 14, NULL, false),
  ('Native Ads', 'Install conversion tracking pixel on landing pages', 'SET UP', 10, NULL, false),
  ('Native Ads', 'Create campaign with headlines, descriptions, and thumbnail images', 'SET UP', 7, NULL, false),
  ('Native Ads', 'Set up audience segments and content category targeting', 'SET UP', 5, NULL, false),
  ('Native Ads', 'Configure daily budget caps and CPC/CPA bid strategy', 'SET UP', 3, NULL, false),
  -- Native Ads – HEALTH CHECK
  ('Native Ads', 'Review CTR and cost-per-click vs benchmark', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Native Ads', 'Check content performance and pause underperforming creatives', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Native Ads', 'Review site/publisher placement quality and block poor performers', 'HEALTH CHECK', NULL, 'fortnightly', false),

  -- Reddit Ads – SET UP
  ('Reddit Ads', 'Create Reddit Ads account and verify business details', 'SET UP', 14, NULL, false),
  ('Reddit Ads', 'Install Reddit Pixel and verify events are firing', 'SET UP', 10, NULL, false),
  ('Reddit Ads', 'Define target subreddits and interest segments', 'SET UP', 7, NULL, false),
  ('Reddit Ads', 'Upload creative assets: images or videos + headline copy', 'SET UP', 7, NULL, false),
  ('Reddit Ads', 'Configure campaign budget and CPC/CPM bid strategy', 'SET UP', 3, NULL, false),
  -- Reddit Ads – HEALTH CHECK
  ('Reddit Ads', 'Review upvote rate, CTR, and engagement vs benchmark', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Reddit Ads', 'Check community sentiment and comment quality', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Reddit Ads', 'Audit subreddit and interest targeting performance', 'HEALTH CHECK', NULL, 'fortnightly', false),

  -- Radio – SET UP
  ('Radio', 'Confirm station lineup, spot lengths, and broadcast schedule', 'SET UP', 21, NULL, false),
  ('Radio', 'Brief production team on script and brand tone-of-voice guidelines', 'SET UP', 14, NULL, false),
  ('Radio', 'Approve final audio production and delivery to station', 'SET UP', 7, NULL, false),
  ('Radio', 'Confirm on-air start date and obtain broadcast affidavit', 'SET UP', 0, NULL, false),
  -- Radio – HEALTH CHECK
  ('Radio', 'Confirm spots are airing as scheduled (affidavit review)', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Radio', 'Review reach and frequency estimates from station', 'HEALTH CHECK', NULL, 'monthly', false),

  -- Linear TV – SET UP
  ('Linear TV', 'Confirm spot bookings with media buyer (channels, dayparts, lengths)', 'SET UP', 28, NULL, false),
  ('Linear TV', 'Brief production team on TVC specs and delivery requirements', 'SET UP', 21, NULL, false),
  ('Linear TV', 'Deliver final TVC files to broadcaster by traffic deadline', 'SET UP', 10, NULL, false),
  ('Linear TV', 'Confirm spots are scheduled and on-air date is locked', 'SET UP', 3, NULL, false),
  -- Linear TV – HEALTH CHECK
  ('Linear TV', 'Obtain broadcast affidavit and confirm spots aired correctly', 'HEALTH CHECK', NULL, 'weekly', false),
  ('Linear TV', 'Review reach, frequency, and TARPs report from media owner', 'HEALTH CHECK', NULL, 'monthly', false),

  -- SVOD – SET UP
  ('SVOD', 'Confirm campaign is booked with SVOD platform (e.g. Foxtel, Stan)', 'SET UP', 21, NULL, false),
  ('SVOD', 'Deliver video creative to platform spec (resolution, codec, length)', 'SET UP', 10, NULL, false),
  ('SVOD', 'Define audience targeting parameters (demographics, genres)', 'SET UP', 7, NULL, false),
  ('SVOD', 'Set up tracking URL or third-party ad verification tag', 'SET UP', 3, NULL, false),
  -- SVOD – HEALTH CHECK
  ('SVOD', 'Review video completion rate (VCR) and reach metrics', 'HEALTH CHECK', NULL, 'weekly', false),
  ('SVOD', 'Check frequency capping and audience delivery vs target', 'HEALTH CHECK', NULL, 'fortnightly', false),

  -- BVOD – SET UP
  ('BVOD', 'Confirm campaign is booked with broadcaster VOD (e.g. 9Now, 7plus, 10 Play)', 'SET UP', 21, NULL, false),
  ('BVOD', 'Deliver video creative to broadcaster spec (resolution, codec, length)', 'SET UP', 10, NULL, false),
  ('BVOD', 'Configure audience targeting (age, gender, content genre)', 'SET UP', 7, NULL, false),
  ('BVOD', 'Set up tracking URL or third-party ad verification tag', 'SET UP', 3, NULL, false),
  -- BVOD – HEALTH CHECK
  ('BVOD', 'Review video completion rate (VCR) and unique reach', 'HEALTH CHECK', NULL, 'weekly', false),
  ('BVOD', 'Check frequency and audience delivery against booking targets', 'HEALTH CHECK', NULL, 'fortnightly', false)
ON CONFLICT DO NOTHING;

-- ─── Media channel specs for new channels ─────────────────────────────────────

INSERT INTO media_channel_specs (media_channel_library_id, spec_text)
VALUES
  -- Native Ads
  ('b2000001-0000-0000-0000-000000000001', 'Thumbnail image: 1200×628px or 400×300px, max 5MB, JPG/PNG, no text overlays'),
  ('b2000001-0000-0000-0000-000000000001', 'Headline: max 60–100 characters depending on platform'),
  ('b2000001-0000-0000-0000-000000000001', 'Description: max 150–200 characters (Taboola/Outbrain); check platform-specific limits'),
  ('b2000001-0000-0000-0000-000000000001', 'Brand name: max 50 characters; destination URL required'),

  -- Reddit Ads
  ('b2000001-0000-0000-0000-000000000002', 'Image: 1200×628px (16:9) or 1080×1080px (1:1), max 30MB, JPG/PNG/GIF'),
  ('b2000001-0000-0000-0000-000000000002', 'Video: 1920×1080px (16:9) recommended, max 1GB, MP4/MOV, max 15 minutes'),
  ('b2000001-0000-0000-0000-000000000002', 'Headline: max 300 characters; post body: max 40,000 characters'),
  ('b2000001-0000-0000-0000-000000000002', 'Thumbnail for video: 1200×628px, auto-generated or custom upload'),

  -- Radio
  ('b2000001-0000-0000-0000-000000000003', 'Standard spot lengths: 15s, 30s, 45s, 60s; confirm with station'),
  ('b2000001-0000-0000-0000-000000000003', 'Audio format: WAV or MP3, 44.1kHz, 16-bit stereo; loudness -23 LUFS (EBU R128)'),
  ('b2000001-0000-0000-0000-000000000003', 'DAB+ digital radio: same audio specs; can include scrolling text and static image'),
  ('b2000001-0000-0000-0000-000000000003', 'Delivery deadline: typically 3–5 business days before broadcast date'),

  -- Linear TV
  ('b2000001-0000-0000-0000-000000000004', 'Standard TVC lengths: 15s, 30s, 45s, 60s; confirm booking length with media owner'),
  ('b2000001-0000-0000-0000-000000000004', 'Video format: 1920×1080px, H.264/ProRes, 25fps, 16:9; audio -23 LUFS (EBU R128)'),
  ('b2000001-0000-0000-0000-000000000004', 'Delivery: AS-11 MXF format for FTA broadcasters; check trafficker specs'),
  ('b2000001-0000-0000-0000-000000000004', 'Closed captions required for FTA; allow 3–5 business days lead time for trafficking'),

  -- SVOD
  ('b2000001-0000-0000-0000-000000000005', 'Video: 1920×1080px minimum, H.264, 25fps, 16:9; audio -23 LUFS'),
  ('b2000001-0000-0000-0000-000000000005', 'Standard lengths: 15s, 30s; check platform for non-skippable vs skippable requirements'),
  ('b2000001-0000-0000-0000-000000000005', 'Companion banner (if supported): 300×250px or 728×90px, max 200KB'),
  ('b2000001-0000-0000-0000-000000000005', 'Delivery: MP4 via platform portal or trafficker; allow 5 business days'),

  -- BVOD
  ('b2000001-0000-0000-0000-000000000006', 'Video: 1920×1080px minimum, H.264 or ProRes, 25fps, 16:9; audio -23 LUFS'),
  ('b2000001-0000-0000-0000-000000000006', 'Standard lengths: 15s, 30s (30s most common); some platforms support 60s'),
  ('b2000001-0000-0000-0000-000000000006', 'Companion banner (if supported): 300×250px, max 200KB JPG/PNG; no animation'),
  ('b2000001-0000-0000-0000-000000000006', 'Delivery via broadcaster ad portal (9Now Ads, 7plus Ad Manager, etc.); 5 business days lead time')
ON CONFLICT DO NOTHING;
