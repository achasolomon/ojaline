-- V42 — Product description for listings (trust: descriptive, searchable titles
-- with a real description are the norm on major marketplaces).
-- catalog.offers sellers already hold table-level grants on catalog.lots from
-- V7 ("GRANT ... ON ALL TABLES IN SCHEMA catalog"), so a new column needs no grant.
ALTER TABLE catalog.lots ADD COLUMN description TEXT;