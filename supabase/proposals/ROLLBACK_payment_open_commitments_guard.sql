-- ROLLBACK for PROPOSAL_payment_open_commitments_guard.sql. Drops the trigger and the two functions. No row is touched.
begin;
drop trigger if exists payments_open_commitment_guard on public.payments;
drop function if exists private.payments_open_commitment_guard();
drop function if exists private.open_instruction_hold_hours();
commit;
