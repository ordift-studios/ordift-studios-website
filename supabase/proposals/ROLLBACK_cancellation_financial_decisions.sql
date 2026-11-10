-- ROLLBACK for PROPOSAL_cancellation_financial_decisions.sql (LOCAL ONLY). Drops the decision records: EXPORT THEM FIRST, they are an evidence record. No payment, enquiry, quotation or booking row is touched.
begin;
drop function if exists public.record_cancellation_financial_execution(uuid, text, uuid);
drop function if exists public.decide_cancellation_financial_action(uuid, text, text, uuid);
drop function if exists public.request_cancellation_financial_action(uuid, text, numeric, text, text, uuid);
drop trigger if exists cancellation_financial_decisions_guard on public.cancellation_financial_decisions;
drop function if exists private.cancellation_financial_decisions_guard();
drop table if exists public.cancellation_financial_decisions;
drop function if exists private.cancellation_financial_headroom(uuid, text, uuid);
drop function if exists private.booking_actor_level(uuid);
commit;
