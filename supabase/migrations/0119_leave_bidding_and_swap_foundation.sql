-- Ordift Studios Workforce/Schedule & Leave Phase, Part 1 (2026-09-15)
-- — Leave Bidding + Leave Swap foundation. Additive only: no existing
-- leave_requests/leave_balances/leave_types row or column is altered
-- in place.
--
-- LEAVE BIDDING: the 10+10 H1/H2 structure is a PLANNING/PACING
-- constraint on top of the real 20-day annual entitlement — it never
-- creates a second balance. leave_requests.half_allocation (migration
-- 0087) already tags a request; what was missing is the configurable
-- WINDOW data (currently only prose in OS-HR-GH-002 §4.2) and a real
-- draw-forward approval marker. leave_bidding_windows supplies the
-- former; draw_forward_approved (new column below) the latter — a
-- request drawing H2 days into the H1 window can only ever become
-- "approved" through an explicit reviewer decision that sets this
-- true, never automatically. "Remaining planning allocation" is
-- deliberately NOT a stored/incrementing column here — it is computed
-- at read time as (window.planning_allocation_days - sum of this
-- person's H1-or-H2-tagged requests still submitted/under_review/
-- approved for that year), the same "derive, never duplicate a ledger"
-- discipline leave_balances.remaining_days already uses.
--
-- LEAVE SWAP: a genuine two-party workflow needs a linkage table
-- (leave_swap_requests) distinct from the single-requester/single-
-- decider shape every other request type in this codebase uses. The
-- two supersede/supersedes columns on leave_requests let a final
-- approved swap take effect WITHOUT ever mutating either original
-- approved row's dates — a new leave_requests row is created per
-- person with the swapped dates, and the original rows are pointed at
-- their replacement, never overwritten. Since both people already had
-- their own leave_balances.used_days deducted at their ORIGINAL
-- approval (Part 8 below enforces equal working-day-count swaps for
-- this phase), nothing needs re-deducting or refunding — the swap only
-- changes WHICH calendar dates an already-consumed entitlement applies
-- to, never the entitlement itself.

begin;

alter table public.leave_requests
  add column draw_forward_approved boolean not null default false,
  add column supersedes_leave_request_id uuid references public.leave_requests (id),
  add column superseded_by_leave_request_id uuid references public.leave_requests (id);

comment on column public.leave_requests.draw_forward_approved is
  'True only when a reviewer has explicitly approved drawing H2 planning-allocation days forward into the H1 window (OS-HR-GH-002 §4.2) — never set automatically. Meaningless (stays false) for a request with no half_allocation, or a non-draw-forward H1/H2 request.';
comment on column public.leave_requests.supersedes_leave_request_id is
  'Set only by an approved Leave Swap: points at the original approved leave_requests row (this person''s own, pre-swap) that this row''s dates replace. The pointed-at row is NEVER mutated or deleted — this is how a swap takes effect without erasing history.';
comment on column public.leave_requests.superseded_by_leave_request_id is
  'Set only by an approved Leave Swap on the ORIGINAL row: points at the new row (same person, same leave_type/balance-year) that now carries the effective dates. A row with this set is historical only — findApprovedLeaveForDate() and every other "what is this person''s CURRENT approved leave" reader must exclude it.';

create index leave_requests_superseded_by_idx on public.leave_requests (superseded_by_leave_request_id) where superseded_by_leave_request_id is not null;

-- Configurable bidding windows — jurisdiction-scoped (WorkforceJurisdiction
-- text, same vocabulary/validation precedent as leave_types.jurisdiction),
-- never a Ghana platform constant. A future jurisdiction can register its
-- own window rows (different planning_allocation_days, different
-- draw_forward_allowed default, different open/close dates) without any
-- code change.
create table public.leave_bidding_windows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  jurisdiction text not null,
  leave_year int not null,
  half text not null,
  planning_allocation_days numeric not null,
  window_opens_at timestamptz not null,
  window_closes_at timestamptz not null,
  draw_forward_allowed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  constraint leave_bidding_windows_half_check check (half in ('H1', 'H2')),
  constraint leave_bidding_windows_window_order_check check (window_closes_at > window_opens_at),
  unique (business_id, jurisdiction, leave_year, half)
);

comment on table public.leave_bidding_windows is
  'Configurable Leave Bidding windows per (jurisdiction, leave_year, half) — the actual data the OS-HR-GH-002 §4.2 "controlled windows"/"10+10 planning allocation" prose describes, previously only text. planning_allocation_days is the PACING cap for that half (Ghana today: 10/10) — never a second entitlement; the real annual entitlement remains leave_types.annual_entitlement_days. draw_forward_allowed is a per-window configuration flag (whether H2->H1 draw-forward is even offered this cycle) — actually approving one specific request''s draw-forward is a separate, per-request reviewer decision (leave_requests.draw_forward_approved), never automatic just because this flag is true.';

alter table public.leave_bidding_windows enable row level security;

create policy "leave_bidding_windows: read any authenticated" on public.leave_bidding_windows
  for select
  to authenticated
  using (true); -- configuration data, not personal — same precedent as leave_types

grant select on public.leave_bidding_windows to authenticated;
grant select, insert, update on public.leave_bidding_windows to service_role;

-- Genuine two-party workflow: initiator proposes swapping THEIR OWN
-- approved leave for a counterpart's OWN approved leave. Both
-- leave_request FKs are real, existing, approved rows — this table
-- never itself grants or fabricates leave. status: proposed ->
-- accepted/declined (counterpart) -> approved/rejected (reviewer), or
-- cancelled by the initiator before the counterpart decides.
create table public.leave_swap_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  initiator_profile_id uuid not null references public.profiles (id),
  initiator_leave_request_id uuid not null references public.leave_requests (id),
  counterpart_profile_id uuid not null references public.profiles (id),
  counterpart_leave_request_id uuid not null references public.leave_requests (id),
  status text not null default 'proposed',
  reason text,
  counterpart_decided_at timestamptz,
  counterpart_decision_notes text,
  reviewer_decided_by uuid references public.profiles (id),
  reviewer_decided_at timestamptz,
  reviewer_decision_notes text,
  resulting_initiator_leave_request_id uuid references public.leave_requests (id),
  resulting_counterpart_leave_request_id uuid references public.leave_requests (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint leave_swap_requests_distinct_parties_check check (initiator_profile_id <> counterpart_profile_id)
);

comment on table public.leave_swap_requests is
  'Two-party Leave Swap workflow — status: proposed | accepted | declined | approved | rejected | cancelled (unconstrained text, application-validated, same precedent as leave_requests.status). resulting_*_leave_request_id are populated only once a reviewer approves: they point at the NEW leave_requests rows created with the swapped dates (see leave_requests.supersedes_leave_request_id/superseded_by_leave_request_id above) — the original initiator/counterpart leave_request rows are never mutated.';

create index leave_swap_requests_initiator_idx on public.leave_swap_requests (initiator_profile_id);
create index leave_swap_requests_counterpart_idx on public.leave_swap_requests (counterpart_profile_id);
create index leave_swap_requests_status_idx on public.leave_swap_requests (status);

alter table public.leave_swap_requests enable row level security;

create policy "leave_swap_requests: read own (either party) or admin" on public.leave_swap_requests
  for select
  to authenticated
  using (
    (select auth.uid()) = initiator_profile_id
    or (select auth.uid()) = counterpart_profile_id
    or (select private.is_admin_or_super_admin())
  );

grant select on public.leave_swap_requests to authenticated;
grant select, insert, update on public.leave_swap_requests to service_role;

create trigger leave_swap_requests_set_updated_at
  before update on public.leave_swap_requests
  for each row execute function public.set_updated_at();

commit;
