-- Migration: Add non-digital channel types to media_channel_library
-- These channels support organic social, EDM, and OOH advertising

INSERT INTO media_channel_library (channel_type, title, notes, created_at, updated_at)
VALUES
  ('Instagram (Organic)', 'Instagram Organic Social', 'Organic content posted on Instagram without paid promotion. Build brand awareness and engage with followers through posts, stories, and reels.', NOW(), NOW()),
  
  ('Facebook (Organic)', 'Facebook Organic Social', 'Organic content posted on Facebook without paid promotion. Share updates, engage with your community, and build brand presence through organic reach.', NOW(), NOW()),
  
  ('LinkedIn (Organic)', 'LinkedIn Organic Social', 'Organic content posted on LinkedIn without paid promotion. Share professional updates, thought leadership, and engage with your B2B network.', NOW(), NOW()),
  
  ('EDM / Email', 'EDM / Email Marketing', 'Email marketing campaigns sent to subscribers. Includes newsletters, promotional emails, transactional emails, and automated email sequences.', NOW(), NOW()),
  
  ('OOH', 'Out of Home Advertising', 'Out-of-home advertising including billboards, transit ads, digital displays, and other physical advertising placements in public spaces.', NOW(), NOW())
ON CONFLICT DO NOTHING;
