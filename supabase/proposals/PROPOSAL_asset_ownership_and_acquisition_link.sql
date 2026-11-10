-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): record WHO LEGALLY OWNS a registered asset, and link ONE financial acquisition to ONE existing asset.
-- Depends on 0186 and 0187 (live). Number assigned at release (next free after 0187 = 0188). Rollback: ROLLBACK_asset_ownership_and_acquisition_link.sql. Rehearsal: rehearse_asset_link.sh.
--
-- WHY. The Assets & Equipment register (company_assets) is a custody register with no legal-entity, cost or payment data; finance acquisitions have an optional asset link column that nothing could ever set. This adds the minimum to
-- reconcile ONE existing asset with ONE acquisition WITHOUT touching the asset row at all (no column on company_assets, no trigger on it: identifier, custody history and registration stay exactly as they are):
--   entity_asset_ownership      the LEGAL OWNER decision for an asset (which legal entity), its stated basis, the purchaser as stated, the business purpose, and any incidental personal use (flagged for accountant review).
--                               Distinct on purpose: purchaser (on the acquisition), legal owner (here), funding source (on the acquisition), assigned user (existing asset_assignments), business purpose (here).
--   link_acquisition_to_asset() the ONLY way to set an acquisition's asset link: once, same legal entity as the asset's recorded owner, one active acquisition per asset (unique index), audited.
-- Nothing creates an asset, an acquisition, an expense, a journal or a verified status; ownership starts as 'pending_professional_review' and no function here changes that.
begin;

alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided',
                        'asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked'));

create table public.entity_asset_ownership (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),          -- the intended LEGAL OWNER
  asset_id uuid not null references public.company_assets (id),
  purchaser_as_stated text check (purchaser_as_stated is null or char_length(btrim(purchaser_as_stated)) between 3 and 200),   -- who bought it, as stated/printed; NOT the owner
  business_purpose text not null check (char_length(btrim(business_purpose)) between 10 and 500),
  incidental_personal_use boolean not null default false,
  personal_use_note text check (personal_use_note is null or char_length(btrim(personal_use_note)) between 10 and 500),
  basis_statement text not null check (char_length(btrim(basis_statement)) between 10 and 1000),      -- how ownership is established (e.g. the Founder's statement; documents pending)
  evidence_document_id uuid references public.employing_entity_documents (id),
  review_status text not null default 'pending_professional_review' check (review_status in ('pending_professional_review')),
  status text not null default 'current' check (status in ('current', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint ownership_personal_use_note check (not incidental_personal_use or personal_use_note is not null),
  constraint ownership_void_shape check ((status = 'void') = (void_reason is not null and voided_by is not null and voided_at is not null))
);
create unique index ownership_one_current on public.entity_asset_ownership (asset_id) where status = 'current';
comment on table public.entity_asset_ownership is 'The legal-owner decision for ONE registered asset. Owner, purchaser, funding source and assigned user are different things. Pending professional review; never an accounting classification.';

create or replace function private.ownership_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_asset_ownership is append-only: void a mistaken record instead' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if (new.employing_entity_id, new.asset_id, new.purchaser_as_stated, new.business_purpose, new.incidental_personal_use, new.personal_use_note, new.basis_statement, new.evidence_document_id, new.review_status, new.recorded_by, new.created_at) is distinct from
       (old.employing_entity_id, old.asset_id, old.purchaser_as_stated, old.business_purpose, old.incidental_personal_use, old.personal_use_note, old.basis_statement, old.evidence_document_id, old.review_status, old.recorded_by, old.created_at)
       or old.status <> 'current' or new.status <> 'void' then raise exception 'an ownership record cannot be edited; void it with a reason and record a correction' using errcode = '42501'; end if;
    return new;
  end if;
  if new.status <> 'current' then raise exception 'a new ownership record is always current' using errcode = '42501'; end if;
  if not exists (select 1 from public.company_assets where id = new.asset_id) then raise exception 'the asset is not in the register' using errcode = '42501'; end if;
  if new.evidence_document_id is not null and not private.finance_doc_ok(new.evidence_document_id, new.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) then
    raise exception 'ownership evidence must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.ownership_guard() from public, anon, authenticated;
create trigger ownership_guard before insert or update or delete on public.entity_asset_ownership for each row execute function private.ownership_guard();

-- the acquisition's asset link: set ONCE (null -> asset), only to an asset whose recorded legal owner is the acquisition's own entity, one active acquisition per asset; never changed or cleared
create unique index acquisitions_one_per_asset on public.entity_equipment_acquisitions (company_asset_id) where company_asset_id is not null and status = 'recorded';
create or replace function private.acquisition_asset_link_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.company_asset_id is not null then raise exception 'the asset link of an acquisition cannot be changed or cleared' using errcode = '42501'; end if;
  if not exists (select 1 from public.entity_asset_ownership o where o.asset_id = new.company_asset_id and o.status = 'current' and o.employing_entity_id = new.employing_entity_id) then
    raise exception 'the asset has no current ownership record for THIS legal entity; record the owner first' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.acquisition_asset_link_guard() from public, anon, authenticated;
create trigger acquisition_asset_link_guard before update on public.entity_equipment_acquisitions for each row
  when (old.company_asset_id is distinct from new.company_asset_id) execute function private.acquisition_asset_link_guard();

alter table public.entity_asset_ownership enable row level security;
create policy "entity_asset_ownership: super admin only" on public.entity_asset_ownership for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_asset_ownership from anon, authenticated, service_role;
grant select on public.entity_asset_ownership to authenticated;
grant select, insert, update on public.entity_asset_ownership to service_role;

create or replace function public.record_asset_ownership(p_asset uuid, p_entity uuid, p_purchaser text, p_purpose text, p_personal_use boolean, p_personal_note text, p_basis text, p_evidence_doc uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o_id uuid;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can record asset ownership' using errcode = '42501'; end if;
  insert into public.entity_asset_ownership (employing_entity_id, asset_id, purchaser_as_stated, business_purpose, incidental_personal_use, personal_use_note, basis_statement, evidence_document_id, recorded_by)
    values (p_entity, p_asset, nullif(btrim(p_purchaser), ''), p_purpose, coalesce(p_personal_use, false), nullif(btrim(p_personal_note), ''), p_basis, p_evidence_doc, p_actor) returning id into o_id;
  insert into public.entity_finance_events (employing_entity_id, event_type, actor_profile_id, detail)
    values (p_entity, 'asset_ownership_recorded', p_actor, jsonb_build_object('ownershipId', o_id, 'assetId', p_asset, 'incidentalPersonalUse', coalesce(p_personal_use, false), 'reviewStatus', 'pending_professional_review'));
  return o_id;
end $$;
revoke all on function public.record_asset_ownership(uuid, uuid, text, text, boolean, text, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_asset_ownership(uuid, uuid, text, text, boolean, text, text, uuid, uuid) to service_role;

create or replace function public.void_asset_ownership(p_ownership uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can void asset ownership' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'a written reason of at least 10 characters is required' using errcode = '42501'; end if;
  select * into o from public.entity_asset_ownership where id = p_ownership for update;
  if not found or o.status <> 'current' then raise exception 'that ownership record is not current' using errcode = '42501'; end if;
  if exists (select 1 from public.entity_equipment_acquisitions a where a.company_asset_id = o.asset_id and a.status = 'recorded') then
    raise exception 'an acquisition is linked to this asset; the ownership cannot be voided' using errcode = '42501'; end if;
  update public.entity_asset_ownership set status = 'void', void_reason = btrim(p_reason), voided_by = p_actor, voided_at = now() where id = p_ownership;
  insert into public.entity_finance_events (employing_entity_id, event_type, actor_profile_id, detail)
    values (o.employing_entity_id, 'asset_ownership_voided', p_actor, jsonb_build_object('ownershipId', o.id, 'assetId', o.asset_id, 'reason', btrim(p_reason)));
end $$;
revoke all on function public.void_asset_ownership(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_asset_ownership(uuid, text, uuid) to service_role;

create or replace function public.link_acquisition_to_asset(p_acquisition uuid, p_asset uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can link an acquisition to an asset' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition for update;
  if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  update public.entity_equipment_acquisitions set company_asset_id = p_asset where id = a.id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, 'asset_linked', p_actor, jsonb_build_object('assetId', p_asset));
end $$;
revoke all on function public.link_acquisition_to_asset(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.link_acquisition_to_asset(uuid, uuid, uuid) to service_role;

commit;
