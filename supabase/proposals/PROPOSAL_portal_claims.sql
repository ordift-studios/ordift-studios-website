-- PROPOSAL (NOT a numbered migration, NOT applied to Production, NOT for Production without separate approval): connecting a staff-recorded enquiry to a client's portal account.
-- Rollback: ROLLBACK_portal_claims.sql. Rehearsals: rehearse_portal_claims.sh and rehearse_portal_claims_concurrency.py.
--
-- THE PROBLEM. A client does not have to register to make an enquiry or receive a quotation, so a staff-recorded enquiry (WhatsApp, telephone, email, in person) has no portal owner, and a client can
-- pay online only on a record their portal account owns. Until now the only way a record got an owner was linkGuestRecordsToAccount(): at sign-in or sign-up, every unowned enquiry with a matching EMAIL
-- was attached to the account, including staff-recorded ones. An email address is not proof of identity (shared mailboxes, typos, someone else's address, sign-up with confirmation switched off).
--
-- THE PROCESS (verification by something only the real client has been given, delivered outside the system):
--  1. An authorised staff member creates a CLAIM INVITATION for one enquiry. The application makes a long random link token and a 6-digit code; only their SHA-256 hashes are stored here, so nobody (staff
--     included) can read them back later. Staff gives the client the link and, separately where possible, the code, through the channel the client already uses (WhatsApp, telephone, email, in person).
--  2. The client signs in to (or creates) THEIR OWN portal account and opens the link. They must type the code. Only then does the database attach the enquiry to THAT signed-in account, atomically.
--  3. The invitation expires (at most 14 days), is single-use, locks after 5 wrong codes, can be revoked, and a staff or admin account can never claim (including the person who created it).
--  4. Ownership of a staff-recorded enquiry can no longer be changed by any other route: a trigger refuses it. Only a Super Admin can RELEASE ownership (with a written reason, and never once money has
--     been paid or is awaiting verification), after which a fresh invitation can be issued.
-- Every step is recorded (this table, the ownership-events table, and the audit log from the application). Nothing is matched automatically on an email address or a telephone number.
-- Website-form enquiries (no staff member recorded them) keep the existing sign-in linking for a confirmed email; staff-recorded ones never do.
begin;

create or replace function private.is_internal_profile(p_profile uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_profile and r.slug in ('staff', 'admin', 'super_admin'))
$$;
create or replace function private.is_super_admin_profile(p_profile uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_profile and r.slug = 'super_admin')
$$;
revoke all on function private.is_internal_profile(uuid), private.is_super_admin_profile(uuid) from public, anon, authenticated, service_role;

create table public.enquiry_portal_claims (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  delivery_channel text not null check (delivery_channel in ('whatsapp', 'telephone', 'email', 'in_person', 'other')),
  delivery_note text,
  risk_level text not null default 'normal' check (risk_level in ('normal', 'elevated')),
  risk_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'claimed', 'revoked', 'expired', 'locked')),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 5 check (max_attempts between 1 and 10),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles (id),
  claimed_at timestamptz,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  closed_reason text,
  constraint enquiry_portal_claims_expiry_window check (expires_at > created_at and expires_at <= created_at + interval '14 days'),
  constraint enquiry_portal_claims_claimed_complete check (status <> 'claimed' or (claimed_by is not null and claimed_at is not null))
);
create unique index enquiry_portal_claims_one_open on public.enquiry_portal_claims (enquiry_id) where status = 'open';
create index enquiry_portal_claims_enquiry_idx on public.enquiry_portal_claims (enquiry_id, created_at desc);

create table public.enquiry_ownership_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id),
  event text not null check (event in ('claimed', 'released')),
  actor uuid not null references public.profiles (id),
  from_user uuid references public.profiles (id),
  to_user uuid references public.profiles (id),
  claim_id uuid references public.enquiry_portal_claims (id),
  reason text,
  created_at timestamptz not null default now()
);
create index enquiry_ownership_events_enquiry_idx on public.enquiry_ownership_events (enquiry_id, created_at);

alter table public.enquiry_portal_claims enable row level security;
alter table public.enquiry_ownership_events enable row level security;
revoke all on public.enquiry_portal_claims, public.enquiry_ownership_events from authenticated, anon, service_role;
grant select on public.enquiry_portal_claims, public.enquiry_ownership_events to service_role;       -- writes only through the functions below; no client-facing policy exists

-- ---------------------------------------------------------------- the only ways ownership changes
create or replace function private.enquiries_owner_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not distinct from old.user_id then return new; end if;
  if coalesce(current_setting('ordift.portal_claim', true), '') = '1' then return new; end if;     -- set only inside the claim / release functions
  if old.user_id is null and old.created_by is null then return new; end if;                          -- a website-form enquiry linked on a confirmed sign-in (existing behaviour)
  raise exception 'ordift:enquiry_ownership_requires_claim';
end $$;
revoke all on function private.enquiries_owner_guard() from public, anon, authenticated, service_role;
drop trigger if exists enquiries_owner_guard on public.enquiries;
create trigger enquiries_owner_guard before update of user_id on public.enquiries for each row execute function private.enquiries_owner_guard();

create or replace function public.create_portal_claim(p_enquiry uuid, p_creator uuid, p_channel text, p_note text, p_token_hash text, p_code_hash text, p_expires_at timestamptz, p_risk_level text, p_risk_reasons jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_id uuid;
begin
  if p_creator is null or not private.is_internal_profile(p_creator) then raise exception 'creator_not_authorized'; end if;
  select user_id into v_owner from public.enquiries where id = p_enquiry for update;
  if not found then raise exception 'enquiry_not_found'; end if;
  if v_owner is not null then return jsonb_build_object('outcome', 'already_owned'); end if;
  update public.enquiry_portal_claims set status = 'expired', closed_at = now(), closed_reason = 'expired' where enquiry_id = p_enquiry and status = 'open' and expires_at <= now();
  if exists (select 1 from public.enquiry_portal_claims where enquiry_id = p_enquiry and status = 'open') then return jsonb_build_object('outcome', 'open_claim_exists'); end if;
  insert into public.enquiry_portal_claims (enquiry_id, token_hash, code_hash, delivery_channel, delivery_note, risk_level, risk_reasons, created_by, expires_at)
    values (p_enquiry, p_token_hash, p_code_hash, p_channel, nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_risk_level, 'normal'), coalesce(p_risk_reasons, '[]'::jsonb), p_creator, p_expires_at) returning id into v_id;
  return jsonb_build_object('outcome', 'created', 'claim_id', v_id);
end $$;

create or replace function public.attempt_portal_claim(p_token_hash text, p_code_hash text, p_claimer uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.enquiry_portal_claims%rowtype; v_owner uuid; v_left int;
begin
  select * into c from public.enquiry_portal_claims where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if c.status <> 'open' then
    -- a used link says plainly whether the project is the caller's own (they may simply have pressed twice) or someone else's
    return jsonb_build_object('outcome', case when c.status = 'claimed' then (case when c.claimed_by = p_claimer then 'already_yours' else 'already_claimed' end) else c.status end,
                              'enquiry_id', case when c.status = 'claimed' and c.claimed_by = p_claimer then c.enquiry_id end);
  end if;
  if c.expires_at <= now() then
    update public.enquiry_portal_claims set status = 'expired', closed_at = now(), closed_reason = 'expired' where id = c.id;
    return jsonb_build_object('outcome', 'expired');
  end if;
  if p_claimer is null or not exists (select 1 from public.profiles where id = p_claimer and access_status = 'active') then return jsonb_build_object('outcome', 'not_eligible', 'reason', 'account_not_active'); end if;
  if private.is_internal_profile(p_claimer) or p_claimer = c.created_by then return jsonb_build_object('outcome', 'not_eligible', 'reason', 'staff_account'); end if;
  select user_id into v_owner from public.enquiries where id = c.enquiry_id for update;
  if v_owner is not null then
    update public.enquiry_portal_claims set status = 'revoked', closed_at = now(), closed_reason = 'already_owned' where id = c.id;
    return jsonb_build_object('outcome', 'already_owned');
  end if;
  if p_code_hash is distinct from c.code_hash then
    v_left := c.max_attempts - (c.attempts + 1);
    update public.enquiry_portal_claims set attempts = attempts + 1, status = case when v_left <= 0 then 'locked' else status end,
      closed_at = case when v_left <= 0 then now() else null end, closed_reason = case when v_left <= 0 then 'too_many_wrong_codes' else null end where id = c.id;
    return jsonb_build_object('outcome', case when v_left <= 0 then 'locked' else 'bad_code' end, 'attempts_left', greatest(v_left, 0));
  end if;
  perform set_config('ordift.portal_claim', '1', true);
  update public.enquiries set user_id = p_claimer where id = c.enquiry_id and user_id is null;
  update public.enquiry_portal_claims set status = 'claimed', claimed_by = p_claimer, claimed_at = now(), closed_at = now(), closed_reason = 'claimed', attempts = attempts where id = c.id;
  insert into public.enquiry_ownership_events (enquiry_id, event, actor, from_user, to_user, claim_id, reason) values (c.enquiry_id, 'claimed', p_claimer, null, p_claimer, c.id, 'link and code verified');
  return jsonb_build_object('outcome', 'claimed', 'enquiry_id', c.enquiry_id, 'claim_id', c.id);
end $$;

create or replace function public.revoke_portal_claim(p_claim uuid, p_actor uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.enquiry_portal_claims%rowtype;
begin
  select * into c from public.enquiry_portal_claims where id = p_claim for update;
  if not found then raise exception 'claim_not_found'; end if;
  if p_actor is null or not (p_actor = c.created_by or private.is_super_admin_profile(p_actor) or exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_actor and r.slug = 'admin')) then raise exception 'actor_not_authorized'; end if;
  if c.status <> 'open' then return jsonb_build_object('outcome', c.status); end if;
  update public.enquiry_portal_claims set status = 'revoked', closed_by = p_actor, closed_at = now(), closed_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'revoked') where id = p_claim;
  return jsonb_build_object('outcome', 'revoked', 'enquiry_id', c.enquiry_id);
end $$;

create or replace function public.release_enquiry_ownership(p_enquiry uuid, p_actor uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if p_actor is null or not private.is_super_admin_profile(p_actor) then raise exception 'actor_not_authorized'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required'; end if;
  select user_id into v_owner from public.enquiries where id = p_enquiry for update;
  if not found then raise exception 'enquiry_not_found'; end if;
  if v_owner is null then return jsonb_build_object('outcome', 'not_owned'); end if;
  if exists (select 1 from public.payments where entity_type = 'enquiry' and entity_id = p_enquiry::text and status not in ('failed', 'rejected')) then raise exception 'payments_exist'; end if;
  perform set_config('ordift.portal_claim', '1', true);
  update public.enquiries set user_id = null where id = p_enquiry;
  insert into public.enquiry_ownership_events (enquiry_id, event, actor, from_user, to_user, reason) values (p_enquiry, 'released', p_actor, v_owner, null, btrim(p_reason));
  return jsonb_build_object('outcome', 'released', 'from_user', v_owner);
end $$;

revoke all on function public.create_portal_claim(uuid, uuid, text, text, text, text, timestamptz, text, jsonb), public.attempt_portal_claim(text, text, uuid), public.revoke_portal_claim(uuid, uuid, text), public.release_enquiry_ownership(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_portal_claim(uuid, uuid, text, text, text, text, timestamptz, text, jsonb), public.attempt_portal_claim(text, text, uuid), public.revoke_portal_claim(uuid, uuid, text), public.release_enquiry_ownership(uuid, uuid, text) to service_role;
commit;
