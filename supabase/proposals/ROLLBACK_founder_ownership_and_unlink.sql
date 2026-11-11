-- ROLLBACK for PROPOSAL_founder_ownership_and_unlink.sql. Refuses if any founder-personal ownership row, any unlink event, or any use of the new flags exists. Restores the 0188 link guard and the 0188 audit-event list. 0188 objects stay.
begin;
do $$ begin
  if exists (select 1 from public.entity_asset_ownership where owner_kind <> 'legal_entity' or owner_profile_id is not null or company_funded or primary_user_as_stated is not null or financing_obligor_as_stated is not null)
     or exists (select 1 from public.entity_finance_events where event_type = 'asset_unlinked') or exists (select 1 from public.entity_finance_events where detail ->> 'ownerKind' = 'founder_personal') then
    raise exception 'founder-personal ownership rows or unlink events exist; rollback refused (void rows instead)'; end if; end $$;
drop function if exists public.unlink_acquisition_from_asset(uuid, text, uuid);
drop function if exists public.record_founder_asset_ownership(uuid, uuid, text, text, text, text, boolean, text, uuid, uuid);
drop trigger if exists acquisition_personal_link_guard on public.entity_equipment_acquisitions;
drop function if exists private.acquisition_personal_link_guard();
drop trigger if exists ownership_kind_guard on public.entity_asset_ownership;
drop function if exists private.ownership_kind_guard();
create or replace function private.acquisition_asset_link_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.company_asset_id is not null then raise exception 'the asset link of an acquisition cannot be changed or cleared' using errcode = '42501'; end if;
  if not exists (select 1 from public.entity_asset_ownership o where o.asset_id = new.company_asset_id and o.status = 'current' and o.employing_entity_id = new.employing_entity_id) then
    raise exception 'the asset has no current ownership record for THIS legal entity; record the owner first' using errcode = '42501'; end if;
  return new;
end $$;
alter table public.entity_asset_ownership drop constraint ownership_kind_shape;
alter table public.entity_asset_ownership drop column excluded_from_company_fixed_assets, drop column financing_obligor_as_stated, drop column primary_user_as_stated, drop column company_funded, drop column owner_profile_id, drop column owner_kind;
alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided', 'asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked'));
comment on column public.entity_asset_ownership.employing_entity_id is null;
commit;
