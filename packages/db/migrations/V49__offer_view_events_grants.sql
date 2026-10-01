-- Per-table grants are required alongside V1's "ALL TABLES IN SCHEMA catalog"
-- grant (which only applied to tables that existed at the time).
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.offer_view_events TO ojaline_app;