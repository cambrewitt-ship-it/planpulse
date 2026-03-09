-- Migration: Seed media_channel_library with all available media channels
-- These channels will be pre-loaded in the Library for use in Media Plan Builder

-- Delete existing entries to avoid duplicates (for idempotency)
DELETE FROM media_channel_library;

-- Insert all media channel types with descriptions
INSERT INTO media_channel_library (channel_type, title, notes, created_at, updated_at)
VALUES
  ('Meta Ads', 'Meta Ads (Facebook & Instagram)', 'Run paid advertising campaigns on Facebook and Instagram platforms. Ideal for B2C and B2B targeting with detailed audience segmentation, multiple ad formats, and comprehensive analytics.', NOW(), NOW()),
  
  ('Google Ads', 'Google Ads', 'Google''s comprehensive advertising platform including Search, Display, Shopping, Video, and App campaigns. Reach users across Google''s vast network with intent-based targeting.', NOW(), NOW()),
  
  ('Google Search', 'Google Search Ads', 'Text-based ads appearing in Google search results. Target users actively searching for products or services with keyword-based campaigns. Pay-per-click model with high intent traffic.', NOW(), NOW()),
  
  ('Google Shopping', 'Google Shopping Ads', 'Product-focused ads displaying images, prices, and merchant information in Google Search and Shopping tab. Ideal for e-commerce businesses with product catalogs.', NOW(), NOW()),
  
  ('LinkedIn Ads', 'LinkedIn Ads', 'Professional B2B advertising platform. Target audiences by job title, industry, company size, and professional attributes. Ideal for lead generation, brand awareness, and recruitment.', NOW(), NOW()),
  
  ('TikTok Ads', 'TikTok Ads', 'Short-form video advertising on TikTok platform. Reach younger demographics with engaging, creative video content. Multiple ad formats including in-feed ads, branded effects, and top view.', NOW(), NOW()),
  
  ('Instagram Ads', 'Instagram Ads', 'Visual advertising platform focused on photos and short videos. Strong engagement rates for lifestyle, fashion, food, and creative industries. Part of Meta advertising ecosystem.', NOW(), NOW()),
  
  ('Display Network', 'Google Display Network', 'Visual banner and video ads across 2+ million websites and apps. Build brand awareness and reach users as they browse the web. Supports remarketing and contextual targeting.', NOW(), NOW()),
  
  ('Organic Social Media', 'Organic Social Media', 'Non-paid social media content across platforms like Facebook, Instagram, LinkedIn, Twitter, TikTok, and others. Build brand awareness, engage with audiences, and drive organic traffic through content marketing.', NOW(), NOW());
