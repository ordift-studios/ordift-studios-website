-- TD-043 (2026-08-18) — closes a race window in checkoutService.ts's
-- application-level duplicate-checkout check: a SELECT-then-INSERT
-- pattern can't be made airtight against two near-simultaneous
-- requests for the same entity+payment_type (rapid double-click, two
-- open tabs) both passing the SELECT before either has inserted its
-- row. A database-level constraint is the only guarantee that's
-- actually race-proof.
--
-- Partial (not a full table-wide unique constraint) — only one
-- *pending* gateway payment may exist per entity+payment_type at a
-- time; any number of completed/failed/refunded rows for the same
-- entity+payment_type remain fully allowed (that's normal payment
-- history, not a duplicate). Scoped to payment_method='gateway' only
-- — bank-transfer's own duplicate-row question is a separate, already
-- tracked, deliberately untouched item (TD-042).
--
-- The application (checkoutService.ts) catches this index's unique-
-- violation (Postgres code 23505) on insert and reconciles against
-- whichever row won the race, rather than surfacing a raw error.
create unique index payments_one_pending_gateway_per_entity
  on public.payments (entity_type, entity_id, payment_type)
  where payment_method = 'gateway' and status = 'pending';
