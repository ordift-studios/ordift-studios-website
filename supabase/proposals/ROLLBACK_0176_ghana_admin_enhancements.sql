-- ROLLBACK for PROPOSED_0176 (Ghana administrative enhancements). LOCAL REHEARSAL ARTEFACT until 0176 is authorized and applied.
-- Refuses to run while any row uses the 0176 features (review dates, or a signing_designation) - export them first.
-- The signatory guard is restored to what is compatible with the rest of the release: the 0177 guard (column-agnostic, keeps the controlled end-date) when
-- 0177 is in place, otherwise the 0173 guard. Signatory entries are never changed by this rollback.
begin;
do $pre$ begin
  if exists (select 1 from public.entity_compliance_reviews) then raise exception 'ordift:rollback_refused: entity_compliance_reviews holds rows; export them first'; end if;
  if exists (select 1 from public.entity_signatories where signing_designation is not null) then raise exception 'ordift:rollback_refused: a signing_designation is recorded; export it first'; end if;
end $pre$;
drop table if exists public.entity_compliance_reviews;
drop function if exists private.entity_compliance_reviews_guard();
do $rollback$ begin
  if to_regprocedure('public.supersede_entity_signatory(uuid,text,text,date,uuid,text)') is not null then
    execute $guard$
create or replace function private.entity_signatories_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_signatories rows are never deleted: end-date the row and add a new one' using errcode = '42501'; end if;
  -- nothing but the legal capacity, the person link, (the signing designation where that column exists) and the controlled end-date can change
  if to_jsonb(new) - array['legal_capacity', 'profile_id', 'signing_designation', 'effective_to']::text[] is distinct from to_jsonb(old) - array['legal_capacity', 'profile_id', 'signing_designation', 'effective_to']::text[] then
    raise exception 'ordift:signatory_immutable: only the legal capacity, the person link and the controlled end-date can be set, each once' using errcode = '42501';
  end if;
  if old.legal_capacity is not null and new.legal_capacity is distinct from old.legal_capacity then
    raise exception 'ordift:signatory_capacity_fixed: the legal capacity of a recorded signatory is not changed; add a new effective-dated row' using errcode = '42501';
  end if;
  if to_jsonb(old) ->> 'signing_designation' is not null and to_jsonb(new) ->> 'signing_designation' is distinct from to_jsonb(old) ->> 'signing_designation' then
    raise exception 'ordift:signatory_designation_fixed: the signing designation of a recorded signatory is not changed; add a new effective-dated row' using errcode = '42501';
  end if;
  if old.profile_id is not null and new.profile_id is distinct from old.profile_id then
    raise exception 'ordift:signatory_person_fixed: the person a signatory is linked to is not changed or cleared; add a new effective-dated row' using errcode = '42501';
  end if;
  if new.effective_to is distinct from old.effective_to then
    if old.effective_to is not null or new.effective_to is null then
      raise exception 'ordift:signatory_end_date_fixed: an end date is set once and is never changed or cleared' using errcode = '42501';
    end if;
    if coalesce(current_setting('ordift.signatory_supersede', true), '') <> 'on' then
      raise exception 'ordift:signatory_end_date_controlled: an entry is end-dated only by public.supersede_entity_signatory' using errcode = '42501';
    end if;
    if new.effective_from is not null and new.effective_to < new.effective_from then
      raise exception 'ordift:signatory_end_before_start: the end date cannot precede the start date' using errcode = '23514';
    end if;
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
$guard$;
  else
    execute $guard$
create or replace function private.entity_signatories_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_signatories rows are never deleted: end-date the row and add a new one' using errcode = '42501'; end if;
  -- nothing but the legal capacity and the person link can change, and each only from empty
  if to_jsonb(new) - 'legal_capacity' - 'profile_id' is distinct from to_jsonb(old) - 'legal_capacity' - 'profile_id' then
    raise exception 'ordift:signatory_immutable: only the legal capacity and the person link can be set, each once' using errcode = '42501';
  end if;
  if old.legal_capacity is not null and new.legal_capacity is distinct from old.legal_capacity then
    raise exception 'ordift:signatory_capacity_fixed: the legal capacity of a recorded signatory is not changed; add a new effective-dated row' using errcode = '42501';
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
$guard$;
  end if;
end $rollback$;
alter table public.entity_signatories drop column if exists signing_designation;
commit;
