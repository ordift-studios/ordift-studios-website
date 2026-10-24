-- Founder-approved 2026-10-25 for Production, to be applied in order 0168, 0169, 0170, 0171 with every application feature gate OFF. Additive only. Rehearsed locally (see supabase/proposals/RELEASE_PLAN_0168_0171.md).
-- NUMBER: 0168 (Production ledger head verified read-only on 2026-10-24: 0167, 160 versions applied). Held Vendor RLS / legal-representation proposals renumber AFTER this set.
-- Dependencies, all present in Production: businesses, profiles, enquiries, employing_entities, user_roles, roles, private.is_staff_or_admin(), public.ordift_studios_business_id().
-- None of the new table names exist in Production (checked). Independent of 0169-0171.
--
-- Purpose (Priority 3): durable, append-only price communications; Founder/Super Admin discount approvals; follow-ups; one conversion record per enquiry.
-- Additive only: no existing table or row is altered. Existing enquiries simply have no communications / follow-ups until staff add them.
-- Currency: amounts are stored in the currency actually communicated (USD today; payable local currency stays disabled by NON_USD_AMOUNT_DUE_ENABLED=false).
-- An optional indicative local-currency line records the governed rate and its effective date; it never replaces the USD amount.
begin;

-- 1. discount approvals (created first: communications reference them)
create table public.enquiry_discount_approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id),
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),           -- hash of the priced scope; a material change invalidates the approval
  scope_snapshot jsonb not null,                                              -- the calculator summary + rate-card snapshot the discount was proposed against
  eligible_base_usd numeric(12, 2) not null check (eligible_base_usd > 0),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  discount_usd numeric(12, 2) not null check (discount_usd > 0),
  total_after_usd numeric(12, 2) not null check (total_after_usd > 0),
  reason text not null check (char_length(btrim(reason)) >= 10),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'superseded', 'invalidated')),
  proposed_by uuid not null references public.profiles (id),
  proposed_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  constraint discount_math check (total_after_usd = eligible_base_usd - discount_usd),
  constraint discount_pct_valid check (discount_type <> 'percentage' or discount_value < 100),
  constraint discount_decision_shape check ((status = 'proposed' and decided_by is null and decided_at is null) or (status <> 'proposed' and decided_by is not null and decided_at is not null))
);
-- at most one live (proposed or approved) discount per enquiry: discounts never stack or duplicate
create unique index enquiry_one_live_discount on public.enquiry_discount_approvals (enquiry_id) where status in ('proposed', 'approved');

-- 2. price communications (append-only revisions)
create table public.enquiry_price_communications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id),
  revision_number integer not null check (revision_number >= 1),
  supersedes_id uuid references public.enquiry_price_communications (id),
  service text not null check (char_length(btrim(service)) >= 2),
  market_slug text not null,
  contracting_entity_id uuid references public.employing_entities (id),
  scope_title text not null,
  scope_lines jsonb not null,                                                 -- deliverables / inclusions exactly as the governed calculator reported them
  pricing_snapshot jsonb not null,                                            -- calculator output + the rate-card values and effective dates it used
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),             -- hash of the exact priced scope this revision communicates (ties a discount approval to THIS revision)
  original_total_usd numeric(12, 2) check (original_total_usd is null or original_total_usd > 0),
  communicated_amount numeric(12, 2) not null check (communicated_amount > 0),
  communicated_currency text not null default 'USD' check (communicated_currency ~ '^[A-Z]{3}$'),
  indicative_local_currency text check (indicative_local_currency ~ '^[A-Z]{3}$'),
  indicative_local_amount numeric(14, 2),
  fx_rate_to_usd numeric(14, 6),
  fx_effective_from timestamptz,
  discount_approval_id uuid references public.enquiry_discount_approvals (id),
  assumptions text, exclusions text, missing_information text,
  channel text not null check (char_length(btrim(channel)) >= 3),
  notes text,
  communicated_at timestamptz not null check (communicated_at <= now() + interval '5 minutes'),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint communication_local_all_or_none check ((indicative_local_currency is null) = (indicative_local_amount is null) and (indicative_local_amount is null) = (fx_rate_to_usd is null) and (fx_rate_to_usd is null) = (fx_effective_from is null)),
  unique (enquiry_id, revision_number)
);
create index enquiry_price_communications_enquiry on public.enquiry_price_communications (enquiry_id, revision_number desc);

-- 3. follow-ups (no generic task/reminder table exists in Production, so this is the minimal reusable shape; nothing is ever sent automatically)
create table public.enquiry_followups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id),
  handler_profile_id uuid not null references public.profiles (id),
  next_action text not null check (char_length(btrim(next_action)) >= 3),
  due_at timestamptz not null,
  last_contact_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  completion_note text,
  rescheduled_from_id uuid references public.enquiry_followups (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint followup_close_shape check ((status = 'open' and completed_at is null and completed_by is null) or (status <> 'open' and completed_at is not null and completed_by is not null))
);
create unique index enquiry_one_open_followup on public.enquiry_followups (enquiry_id) where status = 'open';
create index enquiry_followups_due on public.enquiry_followups (due_at) where status = 'open';

-- 4. one conversion record per enquiry and target: provenance + duplicate protection (the quotation table already allows only one live quotation per enquiry)
create table public.enquiry_conversions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id),
  target_type text not null check (target_type in ('client_quotation')),
  target_id uuid not null,
  price_communication_id uuid references public.enquiry_price_communications (id),
  idempotency_key text not null check (char_length(idempotency_key) >= 16),
  converted_by uuid not null references public.profiles (id),
  converted_at timestamptz not null default now(),
  unique (enquiry_id, target_type),
  unique (idempotency_key)
);

-- ------------------------------------------------------------------ integrity triggers
create function private.enquiry_comm_before_insert() returns trigger language plpgsql set search_path = '' as $$
declare prev record;
begin
  perform pg_advisory_xact_lock(hashtext(new.enquiry_id::text));          -- serialise revisions for one enquiry
  select id, revision_number into prev from public.enquiry_price_communications where enquiry_id = new.enquiry_id order by revision_number desc limit 1;
  new.revision_number := coalesce(prev.revision_number, 0) + 1;
  new.supersedes_id := prev.id;
  if new.discount_approval_id is not null then
    if not exists (select 1 from public.enquiry_discount_approvals d where d.id = new.discount_approval_id and d.enquiry_id = new.enquiry_id and d.status = 'approved') then
      raise exception 'a communicated price can only carry an APPROVED discount belonging to the same enquiry'; end if;
    if not exists (select 1 from public.enquiry_discount_approvals d where d.id = new.discount_approval_id and d.scope_hash = new.scope_hash and d.total_after_usd = new.communicated_amount) then
      raise exception 'the approved discount was granted for a different scope or amount; it must be approved again'; end if;
  end if;
  return new;
end $$;
create trigger enquiry_comm_before_insert before insert on public.enquiry_price_communications for each row execute function private.enquiry_comm_before_insert();

create function private.enquiry_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% rows are append-only', tg_table_name; end $$;
create trigger enquiry_comm_append_only before update or delete on public.enquiry_price_communications for each row execute function private.enquiry_append_only();
create trigger enquiry_conversion_append_only before update or delete on public.enquiry_conversions for each row execute function private.enquiry_append_only();
create trigger enquiry_discount_no_delete before delete on public.enquiry_discount_approvals for each row execute function private.enquiry_append_only();
create trigger enquiry_followup_no_delete before delete on public.enquiry_followups for each row execute function private.enquiry_append_only();

-- Discount decisions: only the decision fields may change, only forward, and only a Super Admin may approve. Staff can propose but never approve.
create function private.enquiry_discount_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(old) - 'status' - 'decided_by' - 'decided_at' - 'decision_note') is distinct from (to_jsonb(new) - 'status' - 'decided_by' - 'decided_at' - 'decision_note') then
    raise exception 'a discount approval record cannot be edited; supersede it with a new proposal'; end if;
  if not ((old.status = 'proposed' and new.status in ('approved', 'rejected', 'superseded')) or (old.status = 'approved' and new.status in ('invalidated', 'superseded'))) then
    raise exception 'invalid discount status change % -> %', old.status, new.status; end if;
  if new.status = 'approved' and not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = new.decided_by and r.slug = 'super_admin') then
    raise exception 'only a Super Admin can approve a discretionary discount'; end if;
  return new;
end $$;
create trigger enquiry_discount_guard before update on public.enquiry_discount_approvals for each row execute function private.enquiry_discount_guard();

-- Follow-ups: only closing is allowed (status/completion fields); rescheduling is an atomic close + new row, so history is kept.
create function private.enquiry_followup_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(old) - 'status' - 'completed_at' - 'completed_by' - 'completion_note' - 'last_contact_at') is distinct from (to_jsonb(new) - 'status' - 'completed_at' - 'completed_by' - 'completion_note' - 'last_contact_at') then
    raise exception 'a follow-up cannot be edited; reschedule it instead'; end if;
  if old.status <> 'open' then raise exception 'a closed follow-up is final'; end if;
  return new;
end $$;
create trigger enquiry_followup_guard before update on public.enquiry_followups for each row execute function private.enquiry_followup_guard();

create function public.reschedule_enquiry_followup(p_followup_id uuid, p_new_due timestamptz, p_actor uuid, p_note text, p_handler uuid default null) returns uuid
language plpgsql set search_path = '' as $$
declare old_row public.enquiry_followups; new_id uuid;
begin
  select * into old_row from public.enquiry_followups where id = p_followup_id and status = 'open' for update;
  if not found then raise exception 'no open follow-up with that id'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'a reason is required to reschedule'; end if;
  update public.enquiry_followups set status = 'cancelled', completed_at = now(), completed_by = p_actor, completion_note = 'Rescheduled: ' || p_note where id = p_followup_id;
  insert into public.enquiry_followups (enquiry_id, handler_profile_id, next_action, due_at, last_contact_at, rescheduled_from_id, created_by)
    values (old_row.enquiry_id, coalesce(p_handler, old_row.handler_profile_id), old_row.next_action, p_new_due, old_row.last_contact_at, old_row.id, p_actor) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.reschedule_enquiry_followup(uuid, timestamptz, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reschedule_enquiry_followup(uuid, timestamptz, uuid, text, uuid) to service_role;

-- ------------------------------------------------------------------ access: staff and admins read; every write goes through the server (service role) after its own checks
alter table public.enquiry_discount_approvals enable row level security; alter table public.enquiry_price_communications enable row level security;
alter table public.enquiry_followups enable row level security; alter table public.enquiry_conversions enable row level security;
create policy "enquiry_discount_approvals: staff read" on public.enquiry_discount_approvals for select to authenticated using ((select private.is_staff_or_admin()));
create policy "enquiry_price_communications: staff read" on public.enquiry_price_communications for select to authenticated using ((select private.is_staff_or_admin()));
create policy "enquiry_followups: staff read" on public.enquiry_followups for select to authenticated using ((select private.is_staff_or_admin()));
create policy "enquiry_conversions: staff read" on public.enquiry_conversions for select to authenticated using ((select private.is_staff_or_admin()));
-- This project's default privileges give anon, authenticated and service_role TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on every new table (TRUNCATE would skip the append-only row triggers). Remove them, then grant only what is intended.
revoke all on public.enquiry_discount_approvals, public.enquiry_price_communications, public.enquiry_followups, public.enquiry_conversions from anon, authenticated, service_role;
grant select on public.enquiry_discount_approvals, public.enquiry_price_communications, public.enquiry_followups, public.enquiry_conversions to authenticated;
grant select, insert, update on public.enquiry_discount_approvals, public.enquiry_followups to service_role;
grant select, insert on public.enquiry_price_communications, public.enquiry_conversions to service_role;
commit;

-- ROLLBACK (only while the tables hold no genuine rows): drop function public.reschedule_enquiry_followup(uuid, timestamptz, uuid, text, uuid); drop tables enquiry_conversions, enquiry_followups,
-- enquiry_price_communications, enquiry_discount_approvals (in that order); drop functions private.enquiry_comm_before_insert, enquiry_append_only,
-- enquiry_discount_guard, enquiry_followup_guard. No existing table is touched, so nothing else needs reverting.
