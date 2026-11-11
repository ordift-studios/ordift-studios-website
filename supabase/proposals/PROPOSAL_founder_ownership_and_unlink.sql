-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): Founder-personal ownership as a distinct type next to legal-entity ownership, the company-funded personal-asset flag, and an audited UNLINK with a mandatory reason.
-- Depends on 0186, 0187, 0188 (live). Number assigned at release (next free after 0188 = 0189). Rollback: ROLLBACK_founder_ownership_and_unlink.sql. Rehearsal: rehearse_founder_ownership.sh.
--
-- WHY. 0188 can only record a LEGAL ENTITY as owner. The Founder declares intended PERSONAL ownership of an asset whose payments the company card funds. Recording the company as owner would misrepresent it; a fictitious personal legal entity would pollute the
-- entity registry and the Qatar/Ghana separation. So: owner_kind = legal_entity | founder_personal (the Founder = the ACTIVE founder identity, never a free-typed person), filed under the legal entity whose records it belongs to (the same-entity rule stays).
-- Kept distinct: purchaser (acquisition + stated here), OWNER (here), primary user (stated here), financing OBLIGOR (stated here), FUNDING SOURCE (on the acquisition: Founder-reported company card), business purpose (here).
-- A founder-personal asset is permanently flagged excluded from company-owned fixed-asset totals (generated column) — only a FUTURE, separately authorised accounting decision could change that. Ownership stays 'pending_professional_review'.
-- Nothing here creates an asset, an acquisition, an expense, a financing obligation, a journal, a receivable, a reimbursement or a tax figure. 0188 objects keep their behaviour: the 0188 guards are NOT edited except the one link guard, which gains ONE controlled exception (the audited unlink).
begin;

alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided',
                        'asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked', 'asset_unlinked'));

alter table public.entity_asset_ownership
  add column owner_kind text not null default 'legal_entity' check (owner_kind in ('legal_entity', 'founder_personal')),
  add column owner_profile_id uuid references public.profiles (id),
  add column company_funded boolean not null default false,
  add column primary_user_as_stated text check (primary_user_as_stated is null or char_length(btrim(primary_user_as_stated)) between 3 and 200),
  add column financing_obligor_as_stated text check (financing_obligor_as_stated is null or char_length(btrim(financing_obligor_as_stated)) between 3 and 300),
  add column excluded_from_company_fixed_assets boolean generated always as (owner_kind = 'founder_personal') stored;
alter table public.entity_asset_ownership add constraint ownership_kind_shape check (
  (owner_kind = 'legal_entity' and owner_profile_id is null and not company_funded) or (owner_kind = 'founder_personal' and owner_profile_id is not null));
comment on column public.entity_asset_ownership.employing_entity_id is 'The legal entity whose records this ownership record is filed under. For owner_kind = legal_entity it is the owner; for founder_personal it is the entity whose books are involved (e.g. the funding entity) and the owner is owner_profile_id.';
comment on column public.entity_asset_ownership.excluded_from_company_fixed_assets is 'TRUE for founder_personal: never counted in company-owned fixed-asset totals unless a future, separately authorised accounting decision says otherwise.';

-- new columns are immutable once recorded (the 0188 guard is untouched and keeps protecting its own columns)
create or replace function private.ownership_kind_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.owner_kind, new.owner_profile_id, new.company_funded, new.primary_user_as_stated, new.financing_obligor_as_stated) is distinct from (old.owner_kind, old.owner_profile_id, old.company_funded, old.primary_user_as_stated, old.financing_obligor_as_stated) then
      raise exception 'ownership type, owner, funding flag, user and obligor cannot be edited; void the record with a reason and record a correction' using errcode = '42501'; end if;
    return new;
  end if;
  if new.owner_kind = 'founder_personal' and not exists (select 1 from public.founder_identities f join public.profiles p on p.id = f.profile_id where f.status = 'active' and f.profile_id = new.owner_profile_id and p.access_status = 'active') then
    raise exception 'a personal owner must be the ACTIVE Founder identity' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.ownership_kind_guard() from public, anon, authenticated;
create trigger ownership_kind_guard before insert or update on public.entity_asset_ownership for each row execute function private.ownership_kind_guard();

create or replace function public.record_founder_asset_ownership(p_asset uuid, p_entity uuid, p_purchaser text, p_user text, p_obligor text, p_purpose text, p_company_funded boolean, p_basis text, p_evidence_doc uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o_id uuid; f uuid;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can record asset ownership' using errcode = '42501'; end if;
  select profile_id into f from public.founder_identities where status = 'active' limit 1;
  if f is null then raise exception 'no active Founder identity is designated' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_basis, ''))) < 20 then raise exception 'the basis must state how the Founder''s ownership and any company funding are established (at least 20 characters)' using errcode = '42501'; end if;
  insert into public.entity_asset_ownership (employing_entity_id, asset_id, purchaser_as_stated, business_purpose, incidental_personal_use, basis_statement, evidence_document_id, recorded_by, owner_kind, owner_profile_id, company_funded, primary_user_as_stated, financing_obligor_as_stated)
    values (p_entity, p_asset, nullif(btrim(p_purchaser), ''), p_purpose, false, p_basis, p_evidence_doc, p_actor, 'founder_personal', f, coalesce(p_company_funded, false), nullif(btrim(p_user), ''), nullif(btrim(p_obligor), '')) returning id into o_id;
  insert into public.entity_finance_events (employing_entity_id, event_type, actor_profile_id, detail)
    values (p_entity, 'asset_ownership_recorded', p_actor, jsonb_build_object('ownershipId', o_id, 'assetId', p_asset, 'ownerKind', 'founder_personal', 'companyFunded', coalesce(p_company_funded, false), 'reviewStatus', 'pending_professional_review', 'excludedFromCompanyFixedAssets', true));
  return o_id;
end $$;
revoke all on function public.record_founder_asset_ownership(uuid, uuid, text, text, text, text, boolean, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_founder_asset_ownership(uuid, uuid, text, text, text, text, boolean, text, uuid, uuid) to service_role;

-- a founder-personal asset may be linked only to an acquisition whose funding source is STATED (not 'to confirm'); the 0188 same-entity rule still applies (its guard is unchanged)
create or replace function private.acquisition_personal_link_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.company_asset_id is not null and exists (select 1 from public.entity_asset_ownership o where o.asset_id = new.company_asset_id and o.status = 'current' and o.owner_kind = 'founder_personal') and new.funding_source_status = 'to_confirm' then
    raise exception 'a Founder-owned asset can be linked only to an acquisition whose funding source is stated' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.acquisition_personal_link_guard() from public, anon, authenticated;
create trigger acquisition_personal_link_guard before update on public.entity_equipment_acquisitions for each row when (old.company_asset_id is distinct from new.company_asset_id) execute function private.acquisition_personal_link_guard();

-- the ONE controlled exception to "a link is never changed or cleared": the audited unlink (mandatory reason; the history is the append-only audit-event table, which already holds the 'asset_linked' event)
create or replace function private.acquisition_asset_link_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.company_asset_id is not null then
    if new.company_asset_id is null and current_setting('ordift.unlink_acquisition', true) = old.id::text then return new; end if;
    raise exception 'the asset link of an acquisition cannot be changed or cleared' using errcode = '42501'; end if;
  if not exists (select 1 from public.entity_asset_ownership o where o.asset_id = new.company_asset_id and o.status = 'current' and o.employing_entity_id = new.employing_entity_id) then
    raise exception 'the asset has no current ownership record for THIS legal entity; record the owner first' using errcode = '42501'; end if;
  return new;
end $$;

create or replace function public.unlink_acquisition_from_asset(p_acquisition uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can unlink an acquisition from an asset' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'a written reason of at least 10 characters is required' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition for update;
  if not found or a.company_asset_id is null then raise exception 'that acquisition is not linked to an asset' using errcode = '42501'; end if;
  perform set_config('ordift.unlink_acquisition', a.id::text, true);
  update public.entity_equipment_acquisitions set company_asset_id = null where id = a.id;
  perform set_config('ordift.unlink_acquisition', '', true);
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, 'asset_unlinked', p_actor, jsonb_build_object('assetId', a.company_asset_id, 'reason', btrim(p_reason)));
end $$;
revoke all on function public.unlink_acquisition_from_asset(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.unlink_acquisition_from_asset(uuid, text, uuid) to service_role;

commit;
