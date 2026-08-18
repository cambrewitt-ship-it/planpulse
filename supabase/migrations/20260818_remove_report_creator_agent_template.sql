-- Remove the "Client Report Creator" agent template — not ready to build/support yet
-- Deletes any rows already seeded into user_agents for this template

DELETE FROM user_agents WHERE template_slug = 'report_creator' AND is_template = true;
