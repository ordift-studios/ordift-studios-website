-- Workshop Management V1, Phase B (2026-08-25).
--
-- Purely additive against an already-substantial, already-live Workshop
-- system (Sanity `workshop` content, Supabase `workshop_registrations`
-- with RLS, working Paystack payment association via
-- payments.entity_type='workshop_registration', role-granting, request/
-- decision flow via project_requests). Nothing here duplicates that —
-- see the Phase B report for the full reuse audit. No existing table's
-- columns, RLS policies, or CHECK constraints are altered; no existing
-- row is written to.
--
-- Verified before writing this migration: workshop_registrations.
-- registration_status/payment_status are unconstrained text (no DB
-- CHECK) but ARE narrowed by TypeScript unions (RegistrationStatus,
-- REGISTRATION_STATUSES) with several existing consumers (reports,
-- admin dropdown, waitlist logic) — so check-in/attendance uses a new,
-- separate `attendance_status` column rather than extending
-- registration_status, keeping every existing consumer of that type
-- completely untouched.

begin;

-- ============================================================
-- Attendee-record refinements + ticket/attendance linkage
-- (additive only — every new column nullable, full_name/registration_status/
-- payment_status untouched, zero existing rows rewritten)
-- ============================================================
alter table public.workshop_registrations
  add column if not exists ticket_type_id uuid,
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists surname text,
  add column if not exists phone_country_code text,
  add column if not exists country_of_residence text,
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists attendance_status text;

comment on column public.workshop_registrations.attendance_status is
  'Event-day attendance tracking — a SEPARATE axis from registration_status (which is about seat/waitlist mechanics, unchanged). Null = not yet determined; ''checked_in'' | ''no_show'' | ''cancelled'' (unconstrained text, same precedent as registration_status itself). Never auto-set by the project_requests reschedule/cancellation flow — remains a manual staff action, matching that flow''s existing "nothing auto-applies" behavior.';
comment on column public.workshop_registrations.ticket_type_id is
  'Which registration/ticket tier this attendee selected — see public.ticket_types. Null for historical registrations predating ticket types, and for workshops configured with a single free/simple registration path (a workshop is not required to define ticket types at all).';

-- ============================================================
-- Ticket / registration types
-- ============================================================
-- Price/amount fields are USD reference amounts, matching the existing
-- convention established by payments.reference_amount_usd and
-- workshop_registrations.amount_due (resolveEntityAmounts() already
-- reads workshop_registrations.amount_due as "amountDueUsd" — this
-- migration preserves that single existing convention rather than
-- introducing a second currency-conversion system; ticket_types.currency
-- is display-only informational metadata, never used to compute the
-- actual charge).
create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  workshop_id text not null,
  name text not null,
  description text,
  price_usd numeric(14,2) not null default 0 check (price_usd >= 0),
  currency text not null default 'USD',
  capacity int check (capacity is null or capacity > 0),
  seats_reserved int not null default 0,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  active boolean not null default true,
  per_person_limit int check (per_person_limit is null or per_person_limit > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ticket_types is
  'Configurable registration/ticket tiers for a Workshop (e.g. Standard, Early Bird, VIP, Complimentary — examples, not a fixed enum). workshop_id references the Sanity workshop document id (text, no Postgres FK), matching the existing workshop_registrations.workshop_id convention exactly. seats_reserved is a denormalized running count, only ever changed via reserve_ticket_type_seat()/release_ticket_type_seat() below — never written directly, so it can never drift out of sync with actual capacity enforcement.';
comment on column public.ticket_types.capacity is
  'A tighter, OPTIONAL per-tier cap — independent of, and never overriding, the overall Sanity workshop.capacity ceiling (which continues to govern the existing registered/waitlist decision via decideRegistrationStatus(), unchanged). Null = no tier-specific cap, bounded only by the overall workshop capacity. A sold-out ticket tier closes only that tier — it does not trigger the workshop-wide waitlist mechanism.';

alter table public.ticket_types enable row level security;

create policy "ticket_types: staff read" on public.ticket_types
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.ticket_types to authenticated;
grant select, insert, update, delete on public.ticket_types to service_role;

create trigger ticket_types_set_updated_at
  before update on public.ticket_types
  for each row execute function public.set_updated_at();

-- Atomic, race-safe capacity reservation — same proven idiom as
-- next_record_sequence() (0013): a single UPDATE...WHERE...RETURNING
-- takes a row lock, so two near-simultaneous registrations for the same
-- (near-capacity) ticket type can never both succeed. Returns true if a
-- seat was actually reserved, false if the ticket type is at capacity,
-- inactive, or outside its sale window — the caller (the public
-- registration route) must treat false as "this ticket is no longer
-- available," never retry-until-success.
create or replace function public.reserve_ticket_type_seat(p_ticket_type_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved boolean;
begin
  update public.ticket_types
  set seats_reserved = seats_reserved + 1
  where id = p_ticket_type_id
    and active = true
    and (sale_starts_at is null or sale_starts_at <= now())
    and (sale_ends_at is null or sale_ends_at > now())
    and (capacity is null or seats_reserved < capacity)
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

revoke all on function public.reserve_ticket_type_seat(uuid) from public;
revoke all on function public.reserve_ticket_type_seat(uuid) from anon;
revoke all on function public.reserve_ticket_type_seat(uuid) from authenticated;
grant execute on function public.reserve_ticket_type_seat(uuid) to service_role;

-- Companion release — used when a reserved-seat registration attempt
-- fails to save after the seat was claimed (rare, but must not leak a
-- permanently-reserved phantom seat), and for a future cancellation
-- flow to free the seat back up.
create or replace function public.release_ticket_type_seat(p_ticket_type_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ticket_types
  set seats_reserved = greatest(seats_reserved - 1, 0)
  where id = p_ticket_type_id;
end;
$$;

revoke all on function public.release_ticket_type_seat(uuid) from public;
revoke all on function public.release_ticket_type_seat(uuid) from anon;
revoke all on function public.release_ticket_type_seat(uuid) from authenticated;
grant execute on function public.release_ticket_type_seat(uuid) to service_role;

-- ============================================================
-- Travel / accommodation / transport assistance — REQUEST CAPTURE ONLY
-- ============================================================
create table public.workshop_travel_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  registration_id uuid not null references public.workshop_registrations (id) on delete cascade,
  assistance_type text not null,
  arrival_date date,
  departure_date date,
  traveller_count int check (traveller_count is null or traveller_count > 0),
  notes text,
  internal_notes text,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workshop_travel_assistance_requests is
  'REQUEST CAPTURE ONLY — no external booking API, no hotel/transport inventory, no automated purchasing. assistance_type: ''accommodation'' | ''transport'' | ''both'' (unconstrained text). status: ''requested'' | ''in_progress'' | ''arranged'' | ''declined'' | ''cancelled'' (unconstrained text) — staff arrange fulfilment manually and update status by hand.';

alter table public.workshop_travel_assistance_requests enable row level security;

create policy "workshop_travel_assistance_requests: read own or staff" on public.workshop_travel_assistance_requests
  for select
  to authenticated
  using (
    (select private.is_staff_or_admin())
    or exists (
      select 1 from public.workshop_registrations r
      where r.id = workshop_travel_assistance_requests.registration_id
        and r.user_id = (select auth.uid())
    )
  );

grant select on public.workshop_travel_assistance_requests to authenticated;
grant select, insert, update, delete on public.workshop_travel_assistance_requests to service_role;

create trigger workshop_travel_assistance_requests_set_updated_at
  before update on public.workshop_travel_assistance_requests
  for each row execute function public.set_updated_at();

-- ============================================================
-- Instructor/facilitator engagement — links Sanity's public-facing
-- `instructor` content to a real internal payee, WITHOUT forcing every
-- instructor to become staff, and WITHOUT exposing compensation via
-- public Sanity content (this table is Supabase-only, never queried by
-- any public route). Reuses Phase 3.3's payment_obligations, never
-- duplicates it.
-- ============================================================
create table public.workshop_instructor_engagements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  workshop_id text not null,
  profile_id uuid references public.profiles (id),
  external_payee_name text,
  role text not null default 'instructor',
  agreed_compensation_amount numeric(14,2) check (agreed_compensation_amount is null or agreed_compensation_amount >= 0),
  agreed_compensation_currency text,
  engagement_status text not null default 'proposed',
  payment_obligation_id uuid references public.payment_obligations (id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint workshop_instructor_engagements_payee_check check (profile_id is not null or external_payee_name is not null)
);

comment on table public.workshop_instructor_engagements is
  'Internal engagement/compensation record for a workshop instructor or facilitator — separate from Sanity''s public-facing `instructor` document (bio/photo/credentials), which this table is never joined to at the database level and which no public route ever reads this table through. An instructor may be real staff/contractor (profile_id) or an external facilitator not yet in the system (external_payee_name) — exactly one of the two is required. payment_obligation_id links to an existing Phase 3.3 payment_obligations row when compensation is actually approved; creating one here never executes a real payout (no PayoutProvider implementation exists — unchanged from Phase 3.3).';

alter table public.workshop_instructor_engagements enable row level security;

create policy "workshop_instructor_engagements: admin read" on public.workshop_instructor_engagements
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.workshop_instructor_engagements to authenticated;
grant select, insert, update, delete on public.workshop_instructor_engagements to service_role;

create trigger workshop_instructor_engagements_set_updated_at
  before update on public.workshop_instructor_engagements
  for each row execute function public.set_updated_at();

commit;
