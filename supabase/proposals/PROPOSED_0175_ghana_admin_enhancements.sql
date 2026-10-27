-- PROPOSED migration 0175 — Ghana administrative enhancements. NOT in supabase/migrations, NOT applied anywhere, NOT rehearsed yet. Founder approved the CONCEPT (27 Oct 2026);
-- it needs separate written authorization before it is moved into the migrations folder, rehearsed on a scratch database and released. Kept SEPARATE from the future PDF-editions migration.
--
-- 1. entity_compliance_reviews — a FOUNDER-SCHEDULED review date for a registration (e.g. Ghana tax registration, next review 7 May 2027).
--    It is deliberately NOT an expiry and NOT a renewal: nothing here says anything was renewed, and nothing is shown as an official date. Append-only; the latest row per registration is the current schedule.
-- 2. entity_signatories.signing_designation — a SEPARATE field from legal_capacity. Ghana keeps legal_capacity = 'sole_proprietor' (the registered fact); 'authorised_signatory' is shown beside it as the
--    signing designation. Set once from empty (same discipline as legal_capacity), never edited or cleared. It does NOT change who counts as having authority to contract (still decided by legal_capacity).
-- Nothing here changes any existing row's value.

begin;

create table public.entity_compliance_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  registration_id uuid not null references public.entity_registrations (id),
  review_due_on date not null,
  basis text not null default 'founder_scheduled' check (basis = 'founder_scheduled'),
  note text check (note is null or length(note) <= 500),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
comment on table public.entity_compliance_reviews is
  'Founder-scheduled compliance review dates. NOT an official expiry and NOT a renewal confirmation. Append-only; the latest row for a registration is the current schedule.';

-- the registration must belong to the same entity
create or replace function private.entity_compliance_reviews_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then raise exception 'entity_compliance_reviews is append-only: record a new review date instead' using errcode = '42501'; end if;
  if not exists (select 1 from public.entity_registrations r where r.id = new.registration_id and r.employing_entity_id = new.employing_entity_id) then
    raise exception 'ordift:review_registration_mismatch: the registration does not belong to this entity' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.entity_compliance_reviews_guard() from public, anon, authenticated;
create trigger entity_compliance_reviews_guard before insert or update or delete on public.entity_compliance_reviews for each row execute function private.entity_compliance_reviews_guard();
create index entity_compliance_reviews_entity_idx on public.entity_compliance_reviews (employing_entity_id, registration_id, created_at desc);
alter table public.entity_compliance_reviews enable row level security;
create policy "entity_compliance_reviews: super admin read" on public.entity_compliance_reviews for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_compliance_reviews from anon, authenticated, service_role;
grant select on public.entity_compliance_reviews to authenticated;
grant select, insert on public.entity_compliance_reviews to service_role;

alter table public.entity_signatories add column signing_designation text check (signing_designation is null or signing_designation = 'authorised_signatory');
comment on column public.entity_signatories.signing_designation is
  'The signing role the entity designates for this person, kept SEPARATE from legal_capacity (the registered legal fact). Set once from empty; never changed. Does not affect eligibility, which is decided by legal_capacity.';

-- Same guard as 0173, with signing_designation added as a third set-once field.
create or replace function private.entity_signatories_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_signatories rows are never deleted: end-date the row and add a new one' using errcode = '42501'; end if;
  if to_jsonb(new) - 'legal_capacity' - 'profile_id' - 'signing_designation' is distinct from to_jsonb(old) - 'legal_capacity' - 'profile_id' - 'signing_designation' then
    raise exception 'ordift:signatory_immutable: only the legal capacity, the person link and the signing designation can be set, each once' using errcode = '42501';
  end if;
  if old.legal_capacity is not null and new.legal_capacity is distinct from old.legal_capacity then
    raise exception 'ordift:signatory_capacity_fixed: the legal capacity of a recorded signatory is not changed; add a new effective-dated row' using errcode = '42501';
  end if;
  if old.signing_designation is not null and new.signing_designation is distinct from old.signing_designation then
    raise exception 'ordift:signatory_designation_fixed: the signing designation of a recorded signatory is not changed; add a new effective-dated row' using errcode = '42501';
  end if;
  if old.profile_id is not null and new.profile_id is distinct from old.profile_id then
    raise exception 'ordift:signatory_person_fixed: the person a signatory is linked to is not changed or cleared; add a new effective-dated row' using errcode = '42501';
  end if;
  if old.profile_id is null and new.profile_id is not null then
    if new.effective_to is not null then raise exception 'ordift:signatory_not_current: only a current signatory can be linked to a person' using errcode = '23514'; end if;
    if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.access_status = 'active') then
      raise exception 'ordift:signatory_person_not_active: the person must have an active account record' using errcode = '23514';
    end if;
    if exists (select 1 from public.entity_signatories s where s.employing_entity_id = new.employing_entity_id and s.profile_id = new.profile_id and s.id <> new.id and s.effective_to is null) then
      raise exception 'ordift:signatory_person_conflict: this person is already a current signatory of this entity' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.entity_signatories_guard() from public, anon, authenticated;
grant update (legal_capacity, profile_id, signing_designation) on public.entity_signatories to service_role;

commit;

-- APPLICATION CHANGES that go with it (not part of this file): (a) "Record a Founder-scheduled review" form on a registration (date + note, Super Admin, audited) and a line
-- "Next Founder-scheduled review: 7 May 2027 (not an official expiry)" under the Ghana tax registration; (b) a once-only "Designate authorised signatory" action that sets signing_designation and
-- renders "Sole proprietor · Authorised signatory"; (c) tests: append-only, wrong-entity registration refused, set-once designation, eligibility unchanged, Qatar rows untouched.
-- ROLLBACK (only while no row uses them): drop table public.entity_compliance_reviews; restore the 0173 guard; alter table public.entity_signatories drop column signing_designation;
-- DATA STEPS AFTER RELEASE (each separately authorized): one review row for the Ghana tax registration due 2027-05-07 (basis: Founder-scheduled); set Ghana signatory signing_designation = 'authorised_signatory'.
