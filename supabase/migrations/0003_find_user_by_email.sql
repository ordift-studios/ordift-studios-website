-- Ordift Studios — email-to-user lookup helper (Version 1.3 cont., 2026-07-24)
--
-- Hardened 2026-07-24 (pre-execution review, before this file's first
-- run): search_path changed from `public` to `''`, for consistency with
-- every other SECURITY DEFINER function in this project
-- (0001_init.sql, 0002_security_advisor_remediation.sql). Zero
-- functional difference either way — the only object this function
-- touches, auth.users, was already fully schema-qualified — but a
-- function class that's supposed to be uniformly locked down should
-- actually be uniform. Column references (auth.users.id,
-- auth.users.email) are now also explicitly qualified, not just the
-- table.
--
-- Case/whitespace-insensitive match added (2026-07-24, same pass):
-- `lower(auth.users.email) = lower(btrim(p_email))` instead of a bare
-- `=`. This is a strict improvement, not a behavior change to the
-- dual-write's contract — confirmed against src/lib/enquiry/schema.ts
-- and src/lib/workshops/registrationSchema.ts, both of which only
-- `.trim()` the submitted email, never lowercase it, while Supabase
-- Auth stores auth.users.email lowercased. The original exact-match
-- version silently failed to link e.g. "John@Example.com" (form input)
-- to an existing "john@example.com" account — every case the old
-- version matched still matches under case-insensitive comparison, and
-- this closes that gap without changing anything else: a genuinely
-- different email still returns no match (dualWrite.ts still writes
-- user_id: null for a guest), and the calling code's best-effort,
-- non-throwing wrapper is untouched.
--
-- Confirmed still necessary: `src/lib/supabase/dualWrite.ts` calls this
-- via `admin.rpc("find_user_id_by_email", { p_email: email })` from
-- both the enquiry and workshop-registration dual-write paths (see
-- dualWriteEnquiry() and dualWriteWorkshopRegistration()), to link a
-- guest submission to an existing account by email match. No other
-- caller exists.
--
-- The enquiry and workshop-registration dual-write needs to link a form
-- submission to an existing account when the submitter's email matches
-- one, even though the submitter may not be logged in at submission
-- time (e.g. a workshop participant who registers as a guest, then
-- later signs up with the same email — or already has an account and
-- forgot to log in first). auth.users isn't reachable through
-- PostgREST, so this SECURITY DEFINER function is the standard Supabase
-- pattern for a service-role-only email lookup: it runs with the
-- privileges of its owner (which can read auth.users) while the grants
-- below keep it callable only via the service role, never
-- anon/authenticated.
--
-- Checklist confirmed:
--   - SECURITY DEFINER: yes
--   - SET search_path = '': yes (this hardening pass)
--   - Fully schema-qualified references: yes (auth.users.id,
--     auth.users.email; p_email is a parameter, not a schema object)
--   - No dynamic SQL: correct — plain `language sql`, no EXECUTE/format()
--   - REVOKE ALL from PUBLIC, anon, authenticated: yes
--   - GRANT EXECUTE only to service_role: yes
--   - Fixed, minimal return type: yes — returns a single uuid scalar,
--     not a row or set

begin;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select auth.users.id
  from auth.users
  where lower(auth.users.email) = lower(btrim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
revoke all on function public.find_user_id_by_email(text) from anon;
revoke all on function public.find_user_id_by_email(text) from authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

commit;
