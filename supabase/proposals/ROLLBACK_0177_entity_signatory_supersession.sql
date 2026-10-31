-- ROLLBACK for PROPOSED_0177 (entity signatory supersession). LOCAL REHEARSAL ARTEFACT until 0177 is authorized and applied.
-- Removes the correction function, the new columns/indexes/constraint, and restores the guard to what it was BEFORE 0177:
--   * if PROPOSED_0176 is in place (signing_designation column exists) -> the 0176 guard;   * otherwise -> the 0173 guard.
-- DATA IS KEPT: any entry already superseded stays as it is (the old entry end-dated, the corrected entry current). Only the machinery that creates
-- further supersessions, and the supersedes_id/supersession_reason link columns, are removed. (If the link must survive a rollback, export those two columns first.)
begin;
drop function if exists public.supersede_entity_signatory(uuid, text, text, date, uuid, text);
drop index if exists public.entity_signatories_one_current_person;
drop index if exists public.entity_signatories_one_successor;
alter table public.entity_signatories drop constraint if exists entity_signatories_supersession_shape;
alter table public.entity_signatories drop column if exists supersession_reason;
alter table public.entity_signatories drop column if exists supersedes_id;
do $rollback$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entity_signatories' and column_name = 'signing_designation') then
    execute $guard$
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
commit;
