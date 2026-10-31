-- Migration 0177 — controlled SUPERSESSION of an entity signatory entry. Prepared for the gated Production release (see supabase/proposals/RELEASE_PLAN_0177_OS-LGL-010_OPTION_A.md); it
-- is applied only on the Founder's separate written authorization, one migration per run. Rehearsed locally on scratch databases (supabase/proposals/REHEARSE_0177_body.sql, rehearse_0177.sh,
-- rehearse_0176_0177.sh, src/lib/legal/signatorySupersession.localdb.e2e.ts). Rollback: supabase/proposals/ROLLBACK_0177_entity_signatory_supersession.sql.
--
-- WHY. Signatory entries are deliberately immutable (0173): only the legal capacity and the person link can be set, once. A mis-recorded name (for example
-- "Alex Sample-Name" where the registration certificate reads "Alex Sample Name") therefore cannot be edited, and the guard also forbids end-dating
-- a row, although its own message says "end-date the row and add a new one". Adding a second current row would leave two current entries for one person and
-- block linking the corrected entry to the person's account. This migration adds the ONE sanctioned way to correct an entry:
--
--   public.supersede_entity_signatory(...)   in ONE transaction:
--     1. end-dates the old entry (effective_to) - the old row is KEPT, unchanged in every other column;
--     2. inserts the corrected entry as a NEW row that copies every other column from the old one (position, authority, capacity, person link, source
--        document, ...) and records which entry it supersedes and why;
--     3. checks that exactly one current entry remains for that person and entity, and writes the audit event.
--   The old entry can be superseded only once, only while it is current, only with a different name and/or authority wording (an empty name keeps the recorded name;
--   an empty authority keeps the recorded authority), and the person link/capacity stay with the person.
--
-- NOTHING ELSE IS LOOSENED. The guard still refuses every other update and every delete. The end-date can be set only from empty, only to a date on/after
-- effective_from, and only while the function holds a transaction-local flag; the flag cannot be set by an ordinary client (the function is executable by
-- service_role only). No existing row, agreement, snapshot, signature request or audit record is changed by this migration itself.
--
-- COMPATIBILITY with the separate PROPOSED_0176 (adds signing_designation and also re-creates this guard): the guard below is written column-agnostically
-- (jsonb access), so it behaves identically whether or not signing_designation exists, and supersede_entity_signatory copies EVERY column of the old row
-- generically. If 0176 is released AFTER this migration, its guard must be amended to keep the end-date clause below, otherwise it would silently remove
-- the supersession path (the function would then fail closed with a clear error; nothing would be corrupted). The unit suite now enforces this: see the
-- "signatory guard: a later migration cannot silently remove the controlled end-date" checks in src/lib/legal/instructorAgreementDocument.test.ts.

begin;

-- 1. Which entry a corrected entry replaces, and why. Both are write-once (set at insert) and enforced by the guard (any update of them is refused).
alter table public.entity_signatories add column supersedes_id uuid references public.entity_signatories (id);
alter table public.entity_signatories add column supersession_reason text;
alter table public.entity_signatories add constraint entity_signatories_supersession_shape
  check ((supersedes_id is null) = (supersession_reason is null) and (supersession_reason is null or char_length(btrim(supersession_reason)) >= 10));
create unique index entity_signatories_one_successor on public.entity_signatories (supersedes_id) where supersedes_id is not null;
comment on column public.entity_signatories.supersedes_id is 'The earlier entry this entry corrects. The earlier entry is kept (end-dated), never edited. An entry has at most one successor.';
comment on column public.entity_signatories.supersession_reason is 'Why the earlier entry was superseded (for example a misspelt name). Required whenever supersedes_id is set.';

-- 2. One current entry per person per entity (the guard already checked this when LINKING a person; this makes it a database rule on every write).
do $$ begin
  if exists (select 1 from public.entity_signatories where effective_to is null and profile_id is not null group by employing_entity_id, profile_id having count(*) > 1) then
    raise exception 'ordift:signatory_duplicates_exist: more than one current entry already exists for one person of one entity; resolve before applying 0177';
  end if;
end $$;
create unique index entity_signatories_one_current_person on public.entity_signatories (employing_entity_id, profile_id) where effective_to is null and profile_id is not null;

-- 3. The guard: identical to 0173 (and column-agnostic), plus the controlled end-date. Everything not listed as settable is still immutable.
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

-- 4. The one sanctioned correction. Returns the id of the new (current) entry.
create or replace function public.supersede_entity_signatory(p_signatory_id uuid, p_corrected_full_name text, p_reason text, p_effective_on date, p_actor uuid, p_corrected_authority text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old public.entity_signatories%rowtype;
  v_new uuid := gen_random_uuid();
  v_name text;
  v_auth text := nullif(btrim(coalesce(p_corrected_authority, '')), '');
begin
  select * into old from public.entity_signatories where id = p_signatory_id for update;
  if not found then raise exception 'ordift:signatory_not_found: no such signatory entry' using errcode = 'P0002'; end if;
  if old.effective_to is not null then raise exception 'ordift:signatory_not_current: only a current entry can be superseded' using errcode = '23514'; end if;
  if exists (select 1 from public.entity_signatories where supersedes_id = old.id) then raise exception 'ordift:signatory_already_superseded: this entry already has a successor' using errcode = '23505'; end if;
  v_name := coalesce(nullif(btrim(coalesce(p_corrected_full_name, '')), ''), old.full_name);          -- an empty name means "the name is not being corrected"
  if char_length(v_name) < 3 then raise exception 'ordift:signatory_name_invalid: enter the corrected full name' using errcode = '23514'; end if;
  if v_auth is not null and char_length(v_auth) < 5 then raise exception 'ordift:signatory_authority_invalid: enter the authority wording exactly as the document states it' using errcode = '23514'; end if;
  if v_name = old.full_name and coalesce(v_auth, old.authority) is not distinct from old.authority then raise exception 'ordift:signatory_unchanged: neither the name nor the authority wording differs from the recorded entry' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:signatory_reason_required: state why the entry is being superseded (at least 10 characters)' using errcode = '23514'; end if;
  if p_effective_on is null or p_effective_on > current_date or (old.effective_from is not null and p_effective_on < old.effective_from) then
    raise exception 'ordift:signatory_date_invalid: the supersession date must be today or earlier, and not before the entry began' using errcode = '23514';
  end if;
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor) then raise exception 'ordift:signatory_actor_required: the person recording the correction must be identified' using errcode = '23514'; end if;

  perform set_config('ordift.signatory_supersede', 'on', true);
  update public.entity_signatories set effective_to = p_effective_on where id = old.id;
  perform set_config('ordift.signatory_supersede', 'off', true);

  -- every column of the old entry is carried over (generic, so a column added later is not forgotten); only the listed ones change
  insert into public.entity_signatories
    select (jsonb_populate_record(null::public.entity_signatories, to_jsonb(old) || jsonb_build_object(
      'id', v_new, 'full_name', v_name, 'authority', coalesce(v_auth, old.authority), 'effective_from', p_effective_on, 'effective_to', null, 'recorded_by', p_actor, 'created_at', now(),
      'supersedes_id', old.id, 'supersession_reason', btrim(p_reason)))).*;

  if (select count(*) from public.entity_signatories where employing_entity_id = old.employing_entity_id and effective_to is null and ((old.profile_id is not null and profile_id = old.profile_id) or id = v_new)) <> 1 then
    raise exception 'ordift:signatory_not_unambiguous: the correction would leave more than one current entry for this person' using errcode = '23505';
  end if;

  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor, 'entity_signatory.superseded', 'employing_entity', old.employing_entity_id::text,
            jsonb_build_object('supersededSignatoryId', old.id, 'newSignatoryId', v_new, 'previousName', old.full_name, 'correctedName', v_name, 'authorityChanged', coalesce(v_auth, old.authority) is distinct from old.authority, 'reason', btrim(p_reason), 'effectiveOn', p_effective_on));
  return v_new;
end $$;
revoke all on function public.supersede_entity_signatory(uuid, text, text, date, uuid, text) from public, anon, authenticated;
grant execute on function public.supersede_entity_signatory(uuid, text, text, date, uuid, text) to service_role;

commit;
