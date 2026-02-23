-- Migration: Seed media_channel_specs with common specs for each channel type
-- Pre-loads standard ad dimensions for each media channel

-- Meta Ads (Facebook & Instagram) specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('1200 x 628 px'),
  ('1080 x 1080 px'),
  ('1080 x 1350 px'),
  ('1200 x 1200 px'),
  ('1920 x 1080 px'),
  ('1080 x 1920 px'),
  ('1280 x 720 px')
) AS specs(spec_text)
WHERE channel_type = 'Meta Ads';

-- Google Ads specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('728 x 90 px'),
  ('300 x 250 px'),
  ('320 x 50 px'),
  ('300 x 600 px'),
  ('970 x 250 px'),
  ('250 x 250 px'),
  ('200 x 200 px')
) AS specs(spec_text)
WHERE channel_type = 'Google Ads';

-- Google Search specs (text ads, no dimensions needed, but keeping for consistency)
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('Text Ad (No Image)')
) AS specs(spec_text)
WHERE channel_type = 'Google Search';

-- Google Shopping specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('1200 x 1200 px'),
  ('800 x 800 px'),
  ('1000 x 1000 px')
) AS specs(spec_text)
WHERE channel_type = 'Google Shopping';

-- LinkedIn Ads specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('1200 x 627 px'),
  ('1080 x 1080 px'),
  ('1200 x 1200 px'),
  ('1920 x 1080 px'),
  ('300 x 250 px')
) AS specs(spec_text)
WHERE channel_type = 'LinkedIn Ads';

-- TikTok Ads specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('1080 x 1920 px'),
  ('1080 x 1080 px'),
  ('1920 x 1080 px'),
  ('1080 x 1350 px')
) AS specs(spec_text)
WHERE channel_type = 'TikTok Ads';

-- Instagram Ads specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('1080 x 1080 px'),
  ('1080 x 1350 px'),
  ('1080 x 1920 px'),
  ('1200 x 628 px'),
  ('1920 x 1080 px')
) AS specs(spec_text)
WHERE channel_type = 'Instagram Ads';

-- Display Network specs
INSERT INTO media_channel_specs (media_channel_library_id, spec_text, created_at, updated_at)
SELECT id, spec_text, NOW(), NOW()
FROM media_channel_library,
(VALUES
  ('728 x 90 px'),
  ('300 x 250 px'),
  ('320 x 50 px'),
  ('300 x 600 px'),
  ('970 x 250 px'),
  ('250 x 250 px'),
  ('336 x 280 px')
) AS specs(spec_text)
WHERE channel_type = 'Display Network';
