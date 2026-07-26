-- Ordift Studios — Client Workspace foundation (v1.1.0 Milestone 2, 2026-07-26)
--
-- Two additive, staging-first extensions to the frozen v1.0.0 baseline,
-- both needed so the reusable Project Workspace (Timeline + Updates
-- tabs) can show clients real data instead of a placeholder. Neither
-- changes existing behavior for staff/admin or for any row that
-- predates this migration.
--
-- 1. activity_log: clients may now read their OWN enquiry/workshop-
--    registration entries (was staff/admin-read only since 0004). This
--    is the exact extension flagged as planned when Milestone 1 shipped
--    (see MILESTONES.md) — reusing the existing audit trail as the
--    client-facing Timeline's data source rather than building a
--    second one.
--
-- 2. enquiry_notes: adds an `audience` column so a note can be marked
--    'internal' (default — behaves exactly as before, staff/admin only)
--    or 'client' (staff/admin-authored, read-only for the owning
--    client). Existing rows all default to 'internal' via the column
--    default, so nothing previously written becomes newly visible to
--    anyone. This is deliberately NOT a boolean — a plain, easily
--    widened text + check constraint, per explicit instruction to
--    support more audiences later (team, vendor, model, ai_generated)
--    without a redesign: widening the allowed set is a small follow-up
--    migration (drop + recreate the check constraint), not a schema
--    change to this column or its RLS policy shape.

begin;

-- ============================================================
-- activity_log: client-read-own
-- ============================================================

create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);

create policy "activity_log: client read own" on public.activity_log
  for select
  to authenticated
  using (
    (
      entity_type = 'enquiry'
      and exists (
        select 1 from public.enquiries e
        where e.id::text = activity_log.entity_id
          and e.user_id = (select auth.uid())
      )
    )
    or
    (
      entity_type = 'workshop_registration'
      and exists (
        select 1 from public.workshop_registrations w
        where w.id::text = activity_log.entity_id
          and w.user_id = (select auth.uid())
      )
    )
  );

-- ============================================================
-- enquiry_notes: audience (internal | client)
-- ============================================================

alter table public.enquiry_notes
  add column audience text not null default 'internal';

alter table public.enquiry_notes
  add constraint enquiry_notes_audience_check
  check (audience in ('internal', 'client'));

create policy "enquiry_notes: client read own client-visible" on public.enquiry_notes
  for select
  to authenticated
  using (
    audience = 'client'
    and exists (
      select 1 from public.enquiries e
      where e.id = enquiry_notes.enquiry_id
        and e.user_id = (select auth.uid())
    )
  );

-- No client insert/update/delete policy — clients cannot create, edit,
-- reply to, or delete a note of either audience. Only the existing
-- "enquiry_notes: staff insert" policy (0004) can write rows, and there
-- is still no update/delete policy for anyone, staff included — notes
-- remain append-only, same as before this migration.

commit;
