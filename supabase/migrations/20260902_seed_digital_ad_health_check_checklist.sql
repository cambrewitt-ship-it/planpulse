-- Migration: Replace generic HEALTH CHECK templates for digital ad channels
-- with the agency's real structured 12-point operational health-check
-- checklist (Delivering / Optimisation / Schedule / Budget / Audience /
-- Identity / Creative / Copy / Call to Action / Comments / URL & Tracking
-- Link / Advantage Plus), used by the new per-channel health-check checklist
-- UI (replaces the old always-visible inline action-point list on channel
-- cards, and is no longer surfaced in the To Do lists at all).
--
-- NOTE: deleting the old generic HEALTH CHECK rows below cascades to
-- client_action_point_completions for those specific rows (ON DELETE
-- CASCADE), so any client who had ticked the old generic Snapchat/Reddit
-- health checks loses that specific completion history. One-time tradeoff
-- of the checklist structure changing — flagged for the team before this
-- ships.

-- ─── 1. Fix channel_type naming so digital-ad templates actually match what
--        the channel picker (ChannelManageMenu.DIGITAL_PLATFORMS) produces ──
-- The picker has only ever produced 'Twitter / X Ads'; an older seed used
-- 'Twitter Ads', making those SET UP rows effectively unreachable. Same
-- precedent as the existing Display Network -> Display Ads rename below.

UPDATE media_channel_library
SET channel_type = 'Twitter / X Ads', title = 'Twitter / X Ads'
WHERE channel_type = 'Twitter Ads';

UPDATE action_points
SET channel_type = 'Twitter / X Ads'
WHERE channel_type = 'Twitter Ads';

-- Pinterest Ads is selectable in the channel picker and elsewhere in the app
-- today but has no media_channel_library entry at all yet — add one.

INSERT INTO media_channel_library (title, channel_type, notes)
SELECT
  'Pinterest Ads',
  'Pinterest Ads',
  'Visual discovery ad platform. Promoted Pins across search, browse and related-pins placements. Strong for shopping and lifestyle/home verticals with long content shelf-life.'
WHERE NOT EXISTS (
  SELECT 1 FROM media_channel_library WHERE channel_type = 'Pinterest Ads'
);

-- ─── 2. Replace existing generic HEALTH CHECK templates for digital ad
--        channels with the structured checklist ─────────────────────────────

DELETE FROM action_points
WHERE category = 'HEALTH CHECK'
  AND channel_type IN (
    'Meta Ads', 'Google Ads', 'LinkedIn Ads', 'TikTok Ads', 'Instagram Ads',
    'Snapchat Ads', 'Pinterest Ads', 'Reddit Ads', 'Twitter / X Ads'
  );

-- ─── 3. Seed the 12-item digital-ad HEALTH CHECK checklist per channel ──────
-- frequency = 'weekly' matches the dominant cadence already used for every
-- other digital-ad HEALTH CHECK item seeded elsewhere in this app.

INSERT INTO action_points (channel_type, text, description, category, frequency, sort_order, completed, created_at, updated_at)
SELECT c.channel_type, i.text, i.description, 'HEALTH CHECK', 'weekly', i.sort_order, false, NOW(), NOW()
FROM (VALUES
  ('Meta Ads'),
  ('Google Ads'),
  ('LinkedIn Ads'),
  ('TikTok Ads'),
  ('Instagram Ads'),
  ('Snapchat Ads'),
  ('Pinterest Ads'),
  ('Reddit Ads'),
  ('Twitter / X Ads')
) AS c(channel_type)
CROSS JOIN (VALUES
  (1,  'Delivering',
       'Check the proper campaign, ad sets and ads are all active.'),
  (2,  'Optimisation',
       'Campaign is optimised for the correct goal as per media schedule (conversion, traffic, etc.)'),
  (3,  'Schedule',
       'All dates are set as per media schedule'),
  (4,  'Budget',
       'Budget is set to the correct net amount. Check that the budget is on pace.'),
  (5,  'Audience',
       'Location, demographic & interests are set as per the media schedule.'),
  (6,  'Identity',
       'The ad is displaying the correct client'),
  (7,  'Creative',
       'The preview displaying as it should and has the correct imagery / video.'),
  (8,  'Copy',
       'Copy is correct with no spelling or grammar errors. All links or tags are linked correctly.'),
  (9,  'Call to Action',
       'The button is displaying the correct CTA'),
  (10, 'Comments',
       'Hiding any negative comments. Replying to any comments if possible or noting any that require client response.'),
  (11, 'URL & Tracking Link',
       'The URL is working and the correct UTM has been applied to each ad.'),
  (12, 'Advantage Plus',
       'Turn off Creative Enhancements')
) AS i(sort_order, text, description);
