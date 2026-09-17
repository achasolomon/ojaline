-- V40 — grant the app role access to the new offer-view tracking table
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.offer_views TO ojaline_app;