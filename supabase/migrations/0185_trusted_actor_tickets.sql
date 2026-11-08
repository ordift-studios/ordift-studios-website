-- PROPOSED 0185 REVISION 4 (DRAFT FOR MANAGEMENT REVIEW. NOT APPLIED, NOT in supabase/migrations, NOT deployed). Trusted-actor binding for the portfolio permission functions and tables, installed in two steps (expand, then enforce).
-- WHY REVISION 4: revision 3 required a ticket for EVERY administrator write the moment it was applied, which the currently deployed application cannot supply (it would have made the internal portfolio library read-only until a coordinated code release). Revision 4 separates INSTALLING the ticket machinery from REQUIRING tickets:
--   * ENFORCEMENT MODE is an append-only log, public.portfolio_ticket_mode_log; the LATEST row is the mode ('observe' or 'enforce'); an EMPTY log means 'enforce' (fail closed). No role except the database owner can write it: not the service key, not a signed-in administrator.
--   * This migration inserts the first row, 'observe'. In observe mode an ORDINARY administrator write proceeds with or without a ticket, but a ticket that is presented is checked and used exactly once. Enforce mode (a separate, individually approved, reversible log entry made after the compatible application is deployed and verified) requires one.
--   * IRREVERSIBLE actions (erasure, purge, retention-policy changes) require a ticket from a recent second-factor session in EVERY mode, from the moment this is applied. Observe mode never relaxes them.
-- Revision 3 is unchanged and remains available; revision 4 is a separate candidate with its own hashes.
-- PROBLEM: every authority check (private.is_portfolio_authority) tests an identity the CALLING SERVER supplies (p_actor, recorded_by, reviewed_by...). A caller holding the service key can name any administrator.
-- DESIGN: an administrator's real signed-in session mints a short-lived SINGLE-USE TICKET through a function that reads the identity from the verified JWT (auth.uid()). The ticket is bound to the administrator, the exact kind of action
-- (including the decision) and the target record. Every authority-gated write consumes one; authority is re-checked at the moment of use. The ticket is a database ROW, not a secret: there is nothing to copy and nothing the service key can read.
-- LIMIT (tested, documented): a holder of the service key can also use the Auth admin API to obtain a session for a named user (generate_link, or set a password; and, by deleting the user's factor, even reach aal2). The ticket does NOT stop a fully compromised service key. It stops impersonation by naming an id, blocks the quiet one-time-link route (such sessions are refused), and records how each ticket was authorised so misuse is detectable.
-- Depends on 0169-0171, 0182, 0183 (revision 3) and 0184 (revision 4). Client-originated answers (client portal) are NOT affected: only administrator-attributed writes can ever need a ticket.
begin;

create table public.portfolio_actor_tickets (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  purpose text not null check (purpose in ('record_permission:granted','record_permission:declined','record_permission:withdrawn','record_permission:verified','request_permission','internal_review:approved','internal_review:rejected','internal_review:returned','internal_review:revoked','declare_people','list_subject:added','list_subject:removed','subject_permission:granted','subject_permission:verified','subject_permission:withdrawn','file_hold:placed','file_hold:released','job_hold:placed','job_hold:released','wording_version','wording_approval','retention_policy','erase_grant','erase_record','purge_log')),
  target text not null check (char_length(target) between 1 and 120),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 seconds',
  used_at timestamptz,
  session_id text, aal text, amr jsonb          -- evidence of HOW the administrator signed in, for the annual review
);
create index portfolio_actor_tickets_open on public.portfolio_actor_tickets (actor_id, purpose, target) where used_at is null;
alter table public.portfolio_actor_tickets enable row level security;
revoke all on public.portfolio_actor_tickets from anon, authenticated, service_role;

-- irreversible actions need a second-factor session (aal2); everything else needs a signed-in administrator. Changing this is a policy decision for management.
create function private.portfolio_ticket_min_aal(p_purpose text) returns text language sql immutable set search_path = '' as $$
  select case when p_purpose like 'erase\_%' or p_purpose like 'purge\_%' or p_purpose = 'retention_policy' then 'aal2' else 'aal1' end $$;
revoke all on function private.portfolio_ticket_min_aal(text) from public, anon, authenticated, service_role;

create function public.portfolio_authority_ticket(p_purpose text, p_target text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t timestamptz; claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
begin
  if me is null then raise exception 'a signed-in administrator session is required'; end if;
  if not private.is_portfolio_authority(me) then raise exception 'only the Founder or an authorised executive admin may do this'; end if;
  if p_purpose is null or p_target is null or btrim(p_target) = '' then raise exception 'state the kind of action and its target'; end if;
  if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end) a where a ->> 'method' in ('password', 'totp', 'webauthn', 'oauth', 'sso/saml')) then raise exception 'sign in with your password or a second factor to confirm this action (a one-time-link session is not accepted)'; end if;
  if private.portfolio_ticket_min_aal(p_purpose) = 'aal2' then
    if coalesce(claims ->> 'aal', 'aal1') <> 'aal2' then raise exception 'this action needs a second-factor sign-in'; end if;
    -- the second factor must have been completed recently (15 minutes), not merely at some point in a long-lived session
    if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end) a where a ->> 'method' in ('totp', 'webauthn') and coalesce(a ->> 'timestamp', '') ~ '^[0-9]+$' and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 900) then
      raise exception 'confirm your second factor again: it must have been completed in the last 15 minutes'; end if;
  end if;
  if (select count(*) from public.portfolio_actor_tickets where actor_id = me and used_at is null and expires_at > now()) >= 20 then raise exception 'too many unused tickets: wait for them to expire'; end if;
  insert into public.portfolio_actor_tickets (actor_id, purpose, target, session_id, aal, amr) values (me, p_purpose, lower(btrim(p_target)), claims ->> 'session_id', claims ->> 'aal', claims -> 'amr') returning expires_at into t;
  return t;
end $$;
revoke all on function public.portfolio_authority_ticket(text, text) from public, anon, service_role;
grant execute on function public.portfolio_authority_ticket(text, text) to authenticated;

-- consume: exactly one unused, unexpired ticket for this actor, kind of action and target; the actor must STILL hold authority now (a revoked administrator's outstanding tickets stop working). Row-locked, so a parallel second use fails closed.
create function private.portfolio_consume_ticket(p_actor uuid, p_purpose text, p_target text) returns void
language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'the administrator named no longer holds authority'; end if;
  select id into tid from public.portfolio_actor_tickets where actor_id = p_actor and purpose = p_purpose and target = lower(btrim(p_target)) and used_at is null and expires_at > now() order by issued_at limit 1 for update skip locked;
  if tid is null then raise exception 'this action needs a fresh sign-in confirmation by the administrator named (no valid ticket for % on this record)', p_purpose; end if;
  update public.portfolio_actor_tickets set used_at = now() where id = tid;
end $$;
revoke all on function private.portfolio_consume_ticket(uuid, text, text) from public, anon, authenticated, service_role;

-- ENFORCEMENT MODE (see header). Append-only; the latest row is the mode; empty means enforce. Nobody but the owner can write it.
create table public.portfolio_ticket_mode_log (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('observe', 'enforce')),
  set_at timestamptz not null default now(),
  set_by text not null default current_user,
  note text not null check (char_length(btrim(note)) between 10 and 300)
);
alter table public.portfolio_ticket_mode_log enable row level security;
revoke all on public.portfolio_ticket_mode_log from anon, authenticated, service_role;
create trigger portfolio_ticket_mode_log_append_only before update or delete on public.portfolio_ticket_mode_log for each row execute function private.portfolio_append_only();
create function private.portfolio_ticket_mode() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select mode from public.portfolio_ticket_mode_log order by id desc limit 1), 'enforce') $$;
revoke all on function private.portfolio_ticket_mode() from public, anon, authenticated, service_role;
insert into public.portfolio_ticket_mode_log (mode, note) values ('observe', 'installed by migration 0185 revision 4: tickets are recorded and used when presented but not yet required for ordinary writes');

-- one generic guard on every authority-gated table (strict for irreversible purposes in every mode; strict for the rest only in enforce mode). Arguments: the column naming the acting administrator; the kind-of-action prefix; the target column(s) (first non-null of a '|' list); the decision/action column (or ''); and 'records' to exempt client-originated rows.
create function private.portfolio_actor_ticket_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new); actor uuid := nullif(j ->> tg_argv[0], '')::uuid; purpose text := tg_argv[1]; tgt text; c text;
begin
  if tg_argv[4] is not null and tg_argv[4] = 'records' and not (j ->> 'source' = 'admin_recorded' or j ->> 'decision' = 'verified' or j ->> 'source' = 'contract') then return new; end if;
  if tg_argv[3] <> '' then purpose := purpose || ':' || (j ->> tg_argv[3]); end if;
  foreach c in array string_to_array(tg_argv[2], '|') loop tgt := coalesce(tgt, nullif(j ->> c, '')); end loop;
  if private.portfolio_ticket_min_aal(purpose) = 'aal2' or private.portfolio_ticket_mode() = 'enforce' then
    perform private.portfolio_consume_ticket(actor, purpose, tgt);                -- required
  else
    begin perform private.portfolio_consume_ticket(actor, purpose, tgt);          -- observe mode, ordinary action: a presented ticket is checked and used once; its absence never blocks the write
    exception when others then null; end;
  end if;
  return new;
end $$;
revoke all on function private.portfolio_actor_ticket_guard() from public, anon, authenticated, service_role;
create trigger a0_portfolio_actor_ticket before insert on public.marketing_permission_records for each row execute function private.portfolio_actor_ticket_guard('recorded_by', 'record_permission', 'job_id', 'decision', 'records');
create trigger a0_portfolio_actor_ticket before insert on public.marketing_permission_requests for each row execute function private.portfolio_actor_ticket_guard('created_by', 'request_permission', 'job_id', '');
create trigger a0_portfolio_actor_ticket before insert on public.portfolio_internal_reviews for each row execute function private.portfolio_actor_ticket_guard('reviewed_by', 'internal_review', 'project_file_id', 'decision');
create trigger a0_portfolio_actor_ticket before insert on public.portfolio_people_declarations for each row execute function private.portfolio_actor_ticket_guard('declared_by', 'declare_people', 'project_file_id', '');
create trigger a0_portfolio_actor_ticket before insert on public.portfolio_file_subjects for each row execute function private.portfolio_actor_ticket_guard('recorded_by', 'list_subject', 'project_file_id', 'action');
create trigger a0_portfolio_actor_ticket before insert on public.portfolio_subject_permissions for each row execute function private.portfolio_actor_ticket_guard('recorded_by', 'subject_permission', 'supersedes_id|subject_id', 'decision');
create trigger a0_portfolio_actor_ticket before insert on public.portfolio_file_holds for each row execute function private.portfolio_actor_ticket_guard('recorded_by', 'file_hold', 'project_file_id', 'action');
create trigger a0_portfolio_actor_ticket before insert on public.marketing_permission_job_holds for each row execute function private.portfolio_actor_ticket_guard('recorded_by', 'job_hold', 'job_id', 'action');
create trigger a0_portfolio_actor_ticket before insert on public.portfolio_retention_policy for each row execute function private.portfolio_actor_ticket_guard('adopted_by', 'retention_policy', 'adopted_by', '');

-- an erased OLDER record can never be verified again (same rule 0184 added for subject permissions; the older table was missing it). A withdrawal is never blocked; a new record from the person concerned is.
create function private.marketing_permission_erased_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if new.decision = 'verified' and new.supersedes_id is not null then
    select id, grantor_name into t from public.marketing_permission_records where id = new.supersedes_id for share;
    if found and (t.grantor_name = '[erased]' or exists (select 1 from public.marketing_permission_redactions r where r.record_id = t.id)) then
      raise exception 'the personal details of that record were erased, so it cannot be verified again: record a new permission'; end if;
  end if;
  return new;
end $$;
revoke all on function private.marketing_permission_erased_guard() from public, anon, authenticated;
create trigger b0_marketing_permission_erased_guard before insert on public.marketing_permission_records for each row execute function private.marketing_permission_erased_guard();

-- the two erasure functions and the purge function that take p_actor are re-created with the added lines: (1) the ticket line right after the authority check; (2) in the two erasure functions, the row lock and the already-erased refusal.
create or replace function public.marketing_permission_record_redact(p_record uuid, p_actor uuid, p_reason text, p_basis text, p_confirm_permitted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare g record; root uuid; chk record; blocker text;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may erase permission details'; end if;
  perform private.portfolio_consume_ticket(p_actor, 'erase_record', p_record::text);
  if p_basis is null or p_basis not in ('retention_period_ended', 'data_subject_request', 'legal_requirement', 'other_documented') then raise exception 'state the basis for the erasure'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then raise exception 'state the reason for the erasure in 10 to 200 characters, without names or personal details'; end if;
  if p_confirm_permitted is distinct from true then raise exception 'confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence'; end if;
  select * into g from public.marketing_permission_records where id = p_record;
  if not found then raise exception 'record not found'; end if;
  root := coalesce(g.supersedes_id, g.id);                                  -- a verification or withdrawal is erased together with the grant it follows
  select * into g from public.marketing_permission_records where id = root for update;   -- serialises two erasures of the same record, and an erasure against a verification
  if g.grantor_name = '[erased]' or exists (select 1 from public.marketing_permission_redactions r where r.record_id = g.id) then raise exception 'the personal details of that record were already erased'; end if;
  select * into chk from public.marketing_permission_record_erasure_check(root, p_basis);
  foreach blocker in array chk.blockers loop raise exception '%', blocker; end loop;
  perform set_config('ordift.redaction', 'on', true);
  update public.marketing_permission_records set grantor_name = '[erased]', evidence_summary = case when evidence_summary is null then null else '[erased under retention policy]' end,
    note = case when note is null then null else '[erased under retention policy]' end
    where id = g.id or supersedes_id = g.id;
  perform set_config('ordift.redaction', 'off', true);
  insert into public.marketing_permission_redactions (record_id, reason, basis, confirmed_permitted, redacted_by) values (g.id, btrim(p_reason), p_basis, true, p_actor);
end $$;
create or replace function public.portfolio_subject_permission_redact(p_permission uuid, p_actor uuid, p_reason text, p_basis text, p_confirm_permitted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare g record; chk record; blocker text;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may erase permission details'; end if;
  perform private.portfolio_consume_ticket(p_actor, 'erase_grant', p_permission::text);
  if p_basis is null or p_basis not in ('retention_period_ended', 'data_subject_request', 'legal_requirement', 'other_documented') then raise exception 'state the basis for the erasure'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then raise exception 'state the reason for the erasure in 10 to 200 characters, without names or personal details'; end if;
  if p_confirm_permitted is distinct from true then raise exception 'confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence'; end if;
  select * into g from public.portfolio_subject_permissions where id = p_permission for update;   -- serialises against a concurrent verification, withdrawal or replacement of this grant
  if not found or g.decision <> 'granted' then raise exception 'choose a recorded grant'; end if;
  if g.grantor_name = '[erased]' or exists (select 1 from public.portfolio_subject_redactions r where r.permission_id = g.id) then raise exception 'the personal details of that permission were already erased'; end if;
  select * into chk from public.portfolio_subject_permission_erasure_check(p_permission, p_basis);
  foreach blocker in array chk.blockers loop raise exception '%', blocker; end loop;
  perform set_config('ordift.redaction', 'on', true);
  update public.portfolio_subject_permissions set grantor_name = '[erased]', grantor_relationship = case when grantor_relationship is null then null else '[erased]' end,
    authority_reference = case when authority_reference is null then null else '[erased under retention policy]' end, evidence_reference = '[erased under retention policy]', note = case when note is null then null else '[erased under retention policy]' end
    where id = g.id or supersedes_id = g.id;
  perform set_config('ordift.redaction', 'off', true);
  insert into public.portfolio_subject_redactions (permission_id, reason, basis, confirmed_permitted, redacted_by) values (g.id, btrim(p_reason), p_basis, true, p_actor);
end $$;
create or replace function public.portfolio_log_purge(p_table text, p_actor uuid, p_reason_code text, p_confirm boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare years integer; c date; n integer;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may purge expired log rows'; end if;
  perform private.portfolio_consume_ticket(p_actor, 'purge_log', p_table);
  if p_reason_code is null or p_reason_code not in ('retention_period_expired', 'annual_retention_review', 'legal_requirement', 'data_subject_request', 'policy_change') then raise exception 'choose the documented reason for the purge'; end if;
  if p_confirm is distinct from true then raise exception 'confirm that purging is permitted: no dispute, legal obligation or audit still needs these log rows'; end if;
  if p_table not in ('portfolio_subject_redactions', 'portfolio_file_holds', 'marketing_permission_redactions', 'marketing_permission_job_holds') then raise exception 'choose one of the four log tables'; end if;
  select p.retention_years into years from public.portfolio_retention_policy p order by p.seq desc limit 1;
  if years is null then raise exception 'no retention policy has been recorded by management, so nothing can be purged'; end if;
  c := (current_date - make_interval(years => years))::date;
  lock table public.portfolio_file_holds, public.marketing_permission_job_holds in share row exclusive mode;   -- a hold placed while a purge runs is never missed
  perform set_config('ordift.log_purge', 'on', true);
  if p_table = 'portfolio_subject_redactions' then
    with d as (delete from public.portfolio_subject_redactions r where r.redacted_at::date < c and private.portfolio_subject_log_free_of_hold(r.permission_id) returning 1) select count(*) into n from d;
  elsif p_table = 'portfolio_file_holds' then
    with d as (delete from public.portfolio_file_holds h where h.recorded_at::date < c and private.portfolio_file_log_free_of_hold(h.project_file_id) returning 1) select count(*) into n from d;
  elsif p_table = 'marketing_permission_redactions' then
    with d as (delete from public.marketing_permission_redactions r where r.redacted_at::date < c and private.portfolio_record_log_free_of_hold(r.record_id) returning 1) select count(*) into n from d;
  else
    with d as (delete from public.marketing_permission_job_holds h where h.recorded_at::date < c and private.portfolio_job_log_free_of_hold(h.job_type, h.job_id) returning 1) select count(*) into n from d;
  end if;
  perform set_config('ordift.log_purge', 'off', true);
  insert into public.portfolio_log_purges (purged_table, rows_purged, cutoff_date, retention_years, reason_code, confirmed, purged_by) values (p_table, n, c, years, p_reason_code, true, p_actor);
  return n;
end $$;

commit;
