-- V16: Reinforce append-only REVOKEs for ojaline_app.

-- Earlier dev iterations re-applied table-wide grants (V1 init) over their own
-- trailing REVOKEs, so the application role drifted back into having UPDATE and
-- DELETE on append-only tables. Re-run the REVOKEs explicitly so the invariant
-- tests hold: these tables may only be written by INSERT from the app role.
-- (pii.users SELECT/UPDATE stays granted — auth and seller flows read it.)

REVOKE UPDATE, DELETE ON escrow.ledger_entries FROM ojaline_app;
REVOKE UPDATE, DELETE ON audit.audit_log FROM ojaline_app;
REVOKE UPDATE, DELETE ON trust.agent_actions FROM ojaline_app;
REVOKE UPDATE, DELETE ON trust.fraud_signals FROM ojaline_app;