-- ROLLBACK for PROPOSAL_asset_ownership_and_acquisition_link.sql. Refuses if any ownership row exists, any acquisition is linked to an asset, or any of its audit events exist (void rows instead). The asset register is never touched.
begin;
do $$ begin
  if exists (select 1 from public.entity_asset_ownership) or exists (select 1 from public.entity_equipment_acquisitions where company_asset_id is not null)
     or exists (select 1 from public.entity_finance_events where event_type in ('asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked')) then
    raise exception 'ownership records, asset links or their audit events exist; rollback refused'; end if; end $$;
drop function if exists public.link_acquisition_to_asset(uuid, uuid, uuid);
drop function if exists public.void_asset_ownership(uuid, text, uuid);
drop function if exists public.record_asset_ownership(uuid, uuid, text, text, boolean, text, text, uuid, uuid);
drop trigger if exists acquisition_asset_link_guard on public.entity_equipment_acquisitions;
drop function if exists private.acquisition_asset_link_guard();
drop index if exists public.acquisitions_one_per_asset;
drop table if exists public.entity_asset_ownership;
drop function if exists private.ownership_guard();
alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided'));
commit;
