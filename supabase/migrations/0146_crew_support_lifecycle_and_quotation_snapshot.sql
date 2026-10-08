-- Crew Support lifecycle completion, quotation project snapshot, assignment
-- override record (2026-10-08).
--
-- INSPECTION SUMMARY:
--   - crew_support_requests.status stops at 'confirmed' (then only
--     'cancelled'). The agreed lifecycle continues Confirmed -> In
--     production -> Completed, which maps onto CRM stages that already
--     exist (in_progress, completed). The status CHECK is widened in the
--     same transaction (drop + re-add of the CHECK only; no row changes
--     meaning, every existing status stays valid).
--   - An issued quotation must not silently change, but the event details
--     it quotes for (date, location, schedule, equipment, roles) were only
--     ever read live from the request. A nullable jsonb snapshot, written
--     once at issue, freezes what the client was actually quoted.
--   - Assigning someone WITHOUT a matching capability is an authorised
--     override that needs a recorded justification; the slot keeps who/why.
--
-- Additive and backward compatible: nullable columns only, no data
-- change, nothing dropped except the superseded CHECK constraint that is
-- immediately re-created wider.

begin;

alter table public.crew_support_requests drop constraint if exists crew_support_requests_status_check;
alter table public.crew_support_requests add constraint crew_support_requests_status_check
  check (status in ('received', 'under_review', 'availability_review', 'quote_preparation', 'quoted', 'agreement_pending', 'payment_pending', 'confirmed', 'in_production', 'completed', 'declined', 'cancelled'));

alter table public.client_quotations add column project_snapshot jsonb;

comment on column public.client_quotations.project_snapshot is
  'Client-visible event details frozen when a Crew Support quotation is issued (project, dates, location, schedule, roles, equipment responsibility). Written once at issue; the printable quotation and portal render this so a later edit to the request cannot change what the client was quoted. NULL for drafts and for non-Crew-Support quotations.';

alter table public.crew_support_slots
  add column assignment_override_reason text,
  add column assignment_override_by uuid references public.profiles (id),
  add column assignment_override_at timestamptz;

alter table public.crew_support_slots
  add constraint crew_support_slots_override_check
    check (assignment_override_reason is null or (assignment_override_by is not null and assignment_override_at is not null and assignee_profile_id is not null));

comment on column public.crew_support_slots.assignment_override_reason is
  'Why an authorised administrator assigned this person although they have no matching active capability for the role. NULL for ordinary capability-matched assignments. Cleared when the assignee changes.';

commit;
