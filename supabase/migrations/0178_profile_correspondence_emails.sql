-- Migration 0178 — PREFERRED CORRESPONDENCE EMAIL (append-only history). Prepared for the gated Production release (see supabase/proposals/RELEASE_PLAN_0178_CORRESPONDENCE_EMAIL.md); it is applied
-- only on the Founder's separate written authorization, AFTER 0177 and one migration per run. Rehearsed locally on scratch databases (supabase/proposals/REHEARSE_0178_body.sql, rehearse_0178.sh,
-- src/lib/legal/correspondenceEmail.localdb.e2e.ts). Rollback: supabase/proposals/ROLLBACK_0178_profile_correspondence_emails.sql.
--
-- WHAT. A person's login email (Supabase Auth) is NOT touched and stays the only email used for login, password reset and signing links. This table records, as
-- separate append-only history, the address a person has asked Ordift to use for ordinary correspondence ("Preferred Correspondence Email — Used for Communication").
-- One row = one decision (set, change or clear). The CURRENT preference is the latest row for the person; a row whose email is NULL means "cleared" (the account
-- email applies again). Rows are never updated or deleted, so every change is preserved.
--
-- PRIVACY (database level). NO signed-in role can read this table at all: `anon` and `authenticated` have no privilege on it, so nobody can retrieve an evidence note, who recorded
-- an entry, its source, its history or another person's record through the API. The one thing a person may read is their OWN CURRENT preferred address, through
-- public.my_correspondence_email(): a security-definer function with NO parameters that answers only for the caller (auth.uid()) and returns that single address (or NULL when none is
-- recorded or it was cleared) - nothing else. Authorized administrators work through server code (service role) after the application's own people-management authority check; the
-- service role can only select and insert. The evidence note is a short REFERENCE to how the request was made and checked (for example "Requested by the instructor from this
-- address by email on <date>; confirmed by call-back"); the database refuses a note that contains an email address or a run of 7 or more digits (phone, card or ID numbers), and the
-- application never copies the note, or a full address, into the shared audit log.
--
-- INDEPENDENCE. Creates one new table, one guard function and trigger, and one read function for the caller's own address. Touches no existing table, function, row or grant; it does not touch private.entity_signatories_guard()
-- and therefore has no ordering conflict with the pending 0176 (Ghana administrative enhancements) or 0177 (signatory supersession): any order is safe.

begin;

create table public.profile_correspondence_emails (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  -- NULL = the preference was cleared. A recorded address is lower-case, one address, 254 characters at most.
  email text check (email is null or (email = lower(email) and length(email) between 3 and 254 and email ~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$')),
  source text not null check (source in ('person_request', 'staff_entered')),
  -- A short reference to the evidence, not a copy of it: no address, no long number.
  evidence_note text not null check (
    char_length(btrim(evidence_note)) between 10 and 500
    and evidence_note !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+'
    and evidence_note !~ '[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9]'
  ),
  recorded_by uuid not null references public.profiles (id),
  -- clock_timestamp() (not now()): two entries recorded in one transaction must still have a strict order, because the CURRENT preference is the latest row.
  created_at timestamptz not null default clock_timestamp()
);
create index profile_correspondence_emails_latest_idx on public.profile_correspondence_emails (profile_id, created_at desc, id);
comment on table public.profile_correspondence_emails is
  'Append-only history of the correspondence email a person has asked Ordift to use for ordinary communication. The latest row for a profile is the current preference (email NULL = cleared). NEVER used for login, password reset or signing links, which use the Supabase Auth account email only.';

create or replace function private.profile_correspondence_emails_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'profile_correspondence_emails is append-only: record a new entry instead of changing or deleting one' using errcode = '42501';
end $$;
revoke all on function private.profile_correspondence_emails_guard() from public, anon, authenticated;
create trigger profile_correspondence_emails_guard before update or delete on public.profile_correspondence_emails for each row execute function private.profile_correspondence_emails_guard();

-- Row-level security stays ON with NO policy for signed-in roles (deny by default); the service role bypasses it. The privileges below are the real boundary.
alter table public.profile_correspondence_emails enable row level security;

-- Production's default privileges give new tables TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to the client roles, so everything is revoked explicitly first. Signed-in roles get NOTHING.
revoke all on public.profile_correspondence_emails from anon, authenticated, service_role;
grant select, insert on public.profile_correspondence_emails to service_role;

-- The caller's own CURRENT preferred address and nothing else. No parameter (so nobody can ask about someone else); fixed search_path; answers from auth.uid() only.
create or replace function public.my_correspondence_email() returns text
language sql stable security definer set search_path = '' as $$
  select e.email from public.profile_correspondence_emails e where e.profile_id = (select auth.uid()) order by e.created_at desc, e.id desc limit 1
$$;
revoke all on function public.my_correspondence_email() from public, anon, authenticated, service_role;
grant execute on function public.my_correspondence_email() to authenticated;
comment on function public.my_correspondence_email() is 'The signed-in caller''s own current preferred correspondence email (NULL when none or cleared). The only read of profile_correspondence_emails available to signed-in roles.';

commit;
