-- ROLLBACK for PROPOSAL_acquisition_payment_arrangements.sql. Refuses to run if any terms or payment row exists (they are financial evidence); void rows instead.
begin;
do $$ begin
  if exists (select 1 from public.entity_acquisition_terms) or exists (select 1 from public.entity_acquisition_payments) or exists (select 1 from public.entity_finance_events where event_type in ('terms_set', 'payment_recorded', 'payment_voided')) then
    raise exception 'rows exist in the payment-arrangement tables or their audit events; rollback refused (void rows instead)'; end if; end $$;
drop function if exists public.record_acquisition_payment(uuid, text, numeric, date, text, text, text, uuid, text, uuid);
drop function if exists public.set_acquisition_terms(uuid, text, date, text, text, uuid);
drop function if exists public.void_acquisition_payment(uuid, text, uuid);
drop table if exists public.entity_acquisition_payments;
drop table if exists public.entity_acquisition_terms;
drop function if exists private.payments_guard();
drop function if exists private.terms_guard();
alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided'));
commit;
