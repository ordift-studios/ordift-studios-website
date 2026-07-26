-- Ordift Studios — Project Requests (v1.1.0 Milestone 4, 2026-07-26)
--
-- Redesigned per explicit instruction from "Reschedule & Cancellation
-- Requests" into a generic, extensible "Project Requests" module — only
-- Reschedule and Cancellation are implemented in v1.1.0, but the schema
-- supports future request types (Booking Update, General Client
-- Request, Invoice Request, Additional Deliverables Request, Change of
-- Location, Additional Services, Equipment Request, Support Request,
-- etc.) being added later with zero code changes, same reasoning as
-- deliverable_categories in 0007.
--
-- 1. request_types: a small business-scoped lookup table (staff/client
--    read, admin manages) — identical shape and RLS posture as
--    deliverable_categories. Seeded with exactly the two approved
--    types; a future type is a data row an admin adds later, not a
--    migration.
--
-- 2. project_requests: client-submitted, staff-decided records. Same
--    polymorphic entity_type/entity_id pattern as activity_log (0004)
--    and deliverables (0007) — not a new convention. Clients can
--    INSERT (their own project only) and SELECT (their own only);
--    never UPDATE or DELETE — nothing a client submits can ever change
--    itself, let alone auto-apply to the underlying enquiry/booking.
--    Staff/admin can SELECT all and UPDATE (to decide), never DELETE —
--    append-only audit trail, same posture as enquiry_notes/
--    activity_log.
--
-- Approving or rejecting a request here never touches `enquiries` or
-- `workshop_registrations` — staff make that change separately via the
-- existing stage/status-change actions, exactly as agreed. Nothing
-- auto-applies.

begin;

-- ============================================================
-- request_types
-- ============================================================

create table public.request_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  key text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);

alter table public.request_types enable row level security;

create policy "request_types: read all authenticated" on public.request_types
  for select
  to authenticated
  using (true);

create policy "request_types: admin manages" on public.request_types
  for all
  to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

grant select, insert, update, delete on public.request_types to authenticated;

insert into public.request_types (business_id, key, label, sort_order) values
  (public.ordift_studios_business_id(), 'reschedule', 'Reschedule Request', 10),
  (public.ordift_studios_business_id(), 'cancellation', 'Cancellation Request', 20);

-- ============================================================
-- project_requests
-- ============================================================

create table public.project_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  entity_type text not null check (entity_type in ('enquiry', 'workshop_registration')),
  entity_id uuid not null,
  request_type_id uuid not null references public.request_types (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  client_notes text,
  staff_decision text check (staff_decision in ('approved', 'rejected')),
  staff_response text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index project_requests_entity_idx on public.project_requests (entity_type, entity_id);

alter table public.project_requests enable row level security;

create policy "project_requests: client insert own" on public.project_requests
  for insert
  to authenticated
  with check (
    (
      entity_type = 'enquiry'
      and exists (
        select 1 from public.enquiries e
        where e.id = project_requests.entity_id
          and e.user_id = (select auth.uid())
      )
    )
    or
    (
      entity_type = 'workshop_registration'
      and exists (
        select 1 from public.workshop_registrations w
        where w.id = project_requests.entity_id
          and w.user_id = (select auth.uid())
      )
    )
  );

create policy "project_requests: client read own" on public.project_requests
  for select
  to authenticated
  using (
    (
      entity_type = 'enquiry'
      and exists (
        select 1 from public.enquiries e
        where e.id = project_requests.entity_id
          and e.user_id = (select auth.uid())
      )
    )
    or
    (
      entity_type = 'workshop_registration'
      and exists (
        select 1 from public.workshop_registrations w
        where w.id = project_requests.entity_id
          and w.user_id = (select auth.uid())
      )
    )
  );

create policy "project_requests: staff read" on public.project_requests
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

create policy "project_requests: staff decide" on public.project_requests
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

-- No delete policy for anyone, client or staff — append-only, same
-- posture as enquiry_notes and activity_log.

grant select, insert on public.project_requests to authenticated;
grant update on public.project_requests to authenticated;

commit;
