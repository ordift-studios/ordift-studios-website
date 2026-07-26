-- Ordift Studios — Client Deliverables (v1.1.0 Milestone 3, 2026-07-26)
--
-- Two additive tables, same patterns already established in this
-- project's Admin Platform work — no redesign of the frozen baseline.
--
-- 1. deliverable_categories: a small, business-scoped lookup table
--    (same shape as feature_flags — staff read, admin manages) so new
--    categories can be added without a code change, ever. Seeded here
--    with the 11 categories requested; adding a 12th is a data insert
--    an admin makes from the Admin Platform, not a migration.
--
-- 2. deliverables: staff-published reference links, one per project.
--    Uses the same polymorphic entity_type/entity_id pattern as
--    activity_log (0004) rather than inventing a new one — entity_type
--    is 'enquiry' or 'workshop_registration', entity_id is that row's
--    id. Staff have full CRUD (same as enquiry_notes); clients get a
--    read-only policy scoped to their own project, mirroring the
--    activity_log/enquiry_notes client-read policies from 0006.
--
-- Deliberately NOT included, per explicit instruction — reserved for a
-- future Document Vault release: file uploads, storage providers,
-- signed URLs, object storage, version history, expiration dates,
-- digital signatures, client acknowledgements. `url`/`thumbnail_url`
-- are staff-entered reference links only, same convention as every
-- other link field in this schema (certificate_url, etc.).

begin;

-- ============================================================
-- deliverable_categories
-- ============================================================

create table public.deliverable_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  key text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);

alter table public.deliverable_categories enable row level security;

-- Every authenticated user (staff or client) can read the category
-- list — it's just names, needed by clients to render/filter their own
-- gallery. Mirrors "businesses readable by authenticated" from 0001.
create policy "deliverable_categories: read all authenticated" on public.deliverable_categories
  for select
  to authenticated
  using (true);

create policy "deliverable_categories: admin manages" on public.deliverable_categories
  for all
  to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

grant select, insert, update, delete on public.deliverable_categories to authenticated;

insert into public.deliverable_categories (business_id, key, label, sort_order) values
  (public.ordift_studios_business_id(), 'edited-photos', 'Edited Photos', 10),
  (public.ordift_studios_business_id(), 'final-videos', 'Final Videos', 20),
  (public.ordift_studios_business_id(), 'gallery-links', 'Gallery Links', 30),
  (public.ordift_studios_business_id(), 'contracts', 'Contracts', 40),
  (public.ordift_studios_business_id(), 'invoices', 'Invoices', 50),
  (public.ordift_studios_business_id(), 'receipts', 'Receipts', 60),
  (public.ordift_studios_business_id(), 'call-sheets', 'Call Sheets', 70),
  (public.ordift_studios_business_id(), 'mood-boards', 'Mood Boards', 80),
  (public.ordift_studios_business_id(), 'workshop-materials', 'Workshop Materials', 90),
  (public.ordift_studios_business_id(), 'certificates', 'Certificates', 100),
  (public.ordift_studios_business_id(), 'other-deliverables', 'Other Deliverables', 110);

-- ============================================================
-- deliverables
-- ============================================================

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  entity_type text not null check (entity_type in ('enquiry', 'workshop_registration')),
  entity_id uuid not null,
  category_id uuid not null references public.deliverable_categories (id),
  title text not null,
  description text,
  url text not null,
  thumbnail_url text,
  published_by uuid references public.profiles (id),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index deliverables_entity_idx on public.deliverables (entity_type, entity_id);
create index deliverables_category_idx on public.deliverables (category_id);

alter table public.deliverables enable row level security;

create policy "deliverables: staff manage" on public.deliverables
  for all
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

create policy "deliverables: client read own" on public.deliverables
  for select
  to authenticated
  using (
    (
      entity_type = 'enquiry'
      and exists (
        select 1 from public.enquiries e
        where e.id = deliverables.entity_id
          and e.user_id = (select auth.uid())
      )
    )
    or
    (
      entity_type = 'workshop_registration'
      and exists (
        select 1 from public.workshop_registrations w
        where w.id = deliverables.entity_id
          and w.user_id = (select auth.uid())
      )
    )
  );

grant select, insert, update, delete on public.deliverables to authenticated;

commit;
