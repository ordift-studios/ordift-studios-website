-- PROPOSAL (NOT a numbered migration, NOT applied to Production, NOT for Production without separate approval): a provider reference identifies at most ONE card payment row.
-- Rollback: ROLLBACK_card_gateway_reference_unique.sql. Read-only check to run first: DIAGNOSTIC_card_gateway_reference.sql.
-- payments.gateway_reference was never unique. For card payments it is the key the provider's webhook and the status check look the payment up by, so a duplicate would make that lookup ambiguous (the
-- webhook then finds nothing and logs "no matching payment", leaving a real payment unmatched). This adds a partial unique index on CARD rows only: (provider, gateway_reference). Bank-transfer rows
-- are outside it (their bank reference now has its own column, see PROPOSAL_payment_integrity_controls.sql), and rows with no reference yet (an attempt just created) are outside it.
-- It changes no row. It first counts violations and stops with a plain message; it never deletes or merges payment rows.
begin;
do $$
declare n int;
begin
  select count(*) into n from (select 1 from public.payments where payment_method = 'gateway' and gateway_reference is not null group by provider, gateway_reference having count(*) > 1) d;
  if n > 0 then raise exception 'ordift:preflight_duplicate_gateway_references: % duplicate card reference(s) exist; resolve them first (see DIAGNOSTIC_card_gateway_reference.sql). Nothing was changed.', n; end if;
end $$;
create unique index payments_card_gateway_reference_unique on public.payments (provider, gateway_reference) where payment_method = 'gateway' and gateway_reference is not null;
comment on index public.payments_card_gateway_reference_unique is 'A provider reference identifies at most one card payment row (the webhook and status check look payments up by it).';
commit;
