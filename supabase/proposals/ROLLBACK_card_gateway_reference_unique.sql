-- ROLLBACK for PROPOSAL_card_gateway_reference_unique.sql. Drops only the index. No row is touched.
begin;
drop index if exists public.payments_card_gateway_reference_unique;
commit;
