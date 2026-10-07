-- Crew Support commitment layer (2026-10-07): crew acceptance, conditional
-- agreement requirement, one-engagement-per-slot idempotency.
--
-- INSPECTION SUMMARY (what already exists and is REUSED, not duplicated):
--   - crew_support_slots.status already has unfilled | proposed | assigned
--     | declined | released. 'assigned' only means STAFF assigned a person;
--     nothing records that the person agreed. That distinction is the one
--     genuine gap, so the slot gains a small acceptance record (below).
--     'declined' already models a refusal.
--   - Compensation is NOT added to the slot. engagements already holds
--     agreed_amount + currency + created_by/created_at for a payee, and
--     payment_obligation_id links the resulting payable (payee_profiles ->
--     engagements -> payment_obligations -> payable_items). A crew
--     member's engagement points at its slot via entity_type =
--     'crew_support_slot', entity_id = slot id; the slot leads to the
--     request, its enquiry and the accepted quotation.
--   - Agreements already exist (agreements.primary_context_type /
--     primary_context_reference, signature_requests, fully-executed
--     statuses). The link is that existing context pair with
--     primary_context_type = 'crew_support_request'. Only the
--     *requirement* — an explicit, audited admin decision — has no home,
--     so the request gains four columns for it.
--   - engagements has no uniqueness per source, so a retried action could
--     create a second engagement. A partial unique index closes that at
--     the database level.
--
-- Additive and backward compatible: every new column is nullable or has a
-- default, no existing row changes meaning, nothing is dropped.

begin;

alter table public.crew_support_slots
  add column crew_accepted_at timestamptz,
  add column crew_accepted_via text,
  add column crew_accepted_recorded_by uuid references public.profiles (id),
  add column crew_acceptance_note text;

alter table public.crew_support_slots
  add constraint crew_support_slots_acceptance_via_check
    check (crew_accepted_via is null or crew_accepted_via in ('staff_recorded', 'portal')),
  add constraint crew_support_slots_acceptance_check
    check (
      crew_accepted_at is null
      or (status = 'assigned' and assignee_profile_id is not null and crew_accepted_via is not null)
    );

comment on column public.crew_support_slots.crew_accepted_at is
  'When the assigned person AGREED to do this job. NULL while merely assigned by staff. Cleared whenever the assignee or status changes. Distinct from status = assigned (staff decision).';

alter table public.crew_support_requests
  add column agreement_required boolean not null default false,
  add column agreement_required_reason text,
  add column agreement_required_by uuid references public.profiles (id),
  add column agreement_required_at timestamptz;

alter table public.crew_support_requests
  add constraint crew_support_requests_agreement_required_check
    check (agreement_required = false or (agreement_required_reason is not null and agreement_required_at is not null));

comment on column public.crew_support_requests.agreement_required is
  'Explicit admin decision that a separate signed agreement is needed (bespoke terms, licensing/IP, unusual cancellation, higher risk/value...). When false, the accepted quotation with its terms is the contract. The agreement itself is a normal agreements row whose primary_context_type = ''crew_support_request'' and primary_context_reference = this request''s reference_number.';

create unique index engagements_one_live_per_crew_slot
  on public.engagements (entity_id)
  where entity_type = 'crew_support_slot' and status <> 'cancelled';

commit;
