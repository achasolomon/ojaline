-- V3: Tighten PII isolation — explicit REVOKE on pii tables for app role (ADR-004)
-- ojaline_app must only read pii through the app.users / app.user_roles views.

REVOKE ALL ON pii.users FROM ojaline_app;
REVOKE ALL ON pii.user_roles FROM ojaline_app;

-- pii.roles is a lookup table (BUYER/SELLER/etc.), not PII — safe to read directly.
GRANT SELECT ON pii.roles TO ojaline_app;
