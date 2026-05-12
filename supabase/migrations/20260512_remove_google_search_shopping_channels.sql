-- Remove Google Search Ads and Google Shopping Ads from the Library
-- These are sub-channels of Google Ads and should not appear as separate library entries

-- Delete action points for Google Search and Google Shopping channels
DELETE FROM action_points WHERE channel_type IN ('Google Search', 'Google Shopping');

-- Delete the library entries for Google Search and Google Shopping
DELETE FROM media_channel_library WHERE channel_type IN ('Google Search', 'Google Shopping');

-- Remove the 'hello' test action point from Google Ads
DELETE FROM action_points WHERE channel_type = 'Google Ads' AND LOWER(text) = 'hello';
