-- Ordift Studios — Generic Workflow Engine (Portfolio Management System, 2026-08-04)
--
-- Two additive tables power a reusable review/approval workflow. First
-- consumer is the Portfolio Management System (Sanity-backed
-- portfolioProject documents) — approved architecture: Sanity stays
-- the content source of truth, this schema tracks lifecycle status,
-- review metadata, and collaborator scoping, the same way the rest of
-- the Admin Platform's operational state lives in Supabase.
--
-- Deliberately generic (entity_type/entity_id), the same polymorphic
-- pattern already used by activity_log/deliverables/project_requests,
-- so workshop assignment review, talent applications, and vendor
-- submissions can reuse it later without another migration — the
-- explicit long-term direction approved alongside this build.
--
-- entity_id is `text`, not `uuid` (unlike project_assignments, 0009):
-- Sanity document IDs are not UUIDs. project_assignments itself is
-- left untouched — retrofitting its uuid-typed entity_id and its
-- enquiry/workshop_registration-only check constraint would be a
-- breaking change to a table already backing live RLS policies for
-- an unrelated feature. workflow_assignments below is a new,
-- string-keyed equivalent, scoped to the Photographer/contractor
-- permission tier approved for Portfolio.
--
-- Status values (draft/pending_review/approved/published/archived)
-- and the fine-grained "who can move what to which status" matrix are
-- intentionally NOT enforced by CHECK constraints or RLS here, beyond
-- whose row is being touched — different future entity types will
-- have different lifecycles. That logic lives in application code
-- (src/lib/workflow/), matching how every other Admin Platform
-- permission decision in this codebase is enforced at the action
-- layer, not the database layer, aside from row ownership.

begin;

-- ============================================================
-- workflow_statuses — current lifecycle state for one entity.
-- ============================================================
create table public.workflow_statuses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  entity_type text not null,
  entity_id text not null,
  status text not null default 'draft',
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_notes text,
  scheduled_publish_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, entity_type, entity_id)
);

create index workflow_statuses_entity_idx on public.workflow_statuses (entity_type, entity_id);
create index workflow_statuses_status_idx on public.workflow_statuses (entity_type, status);

create trigger set_workflow_statuses_updated_at
  before update on public.workflow_statuses
  for each row execute function public.set_updated_at();

-- ============================================================
-- workflow_assignments — scopes a contractor/collaborator to
-- specific entities. Mirrors project_assignments' shape and intent
-- (0009's own comment: "sees only projects they are explicitly
-- assigned to") but generalized to any entity_type/text entity_id.
-- ============================================================
create table public.workflow_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  status text not null default 'active' check (status in ('active', 'removed')),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  unique (user_id, entity_type, entity_id)
);

create index workflow_assignments_entity_idx on public.workflow_assignments (entity_type, entity_id);
create index workflow_assignments_user_idx on public.workflow_assignments (user_id);

-- ============================================================
-- has_workflow_access() — true only for an 'active' assignment,
-- mirrors private.has_project_access() (0009) for the new tables.
-- ============================================================
create or replace function private.has_workflow_access(p_entity_type text, p_entity_id text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workflow_assignments wa
    join public.profiles p on p.id = wa.user_id
    where wa.user_id = auth.uid()
      and wa.entity_type = p_entity_type
      and wa.entity_id = p_entity_id
      and wa.status = 'active'
      and p.access_status = 'active'
      and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

revoke all on function private.has_workflow_access(text, text) from public, anon, authenticated, service_role;
grant execute on function private.has_workflow_access(text, text) to authenticated;

-- ============================================================
-- RLS — workflow_statuses
-- ============================================================
alter table public.workflow_statuses enable row level security;

create policy "workflow_statuses: staff read" on public.workflow_statuses
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

create policy "workflow_statuses: assigned collaborator read" on public.workflow_statuses
  for select
  to authenticated
  using ((select private.has_workflow_access(entity_type, entity_id)));

create policy "workflow_statuses: staff insert" on public.workflow_statuses
  for insert
  to authenticated
  with check ((select private.is_staff_or_admin()));

create policy "workflow_statuses: staff update" on public.workflow_statuses
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

-- Assigned collaborators (Photographer tier) can create their own
-- submission row and edit it while it's still draft/pending_review —
-- never once it's moved past that. Which *status value* they're
-- allowed to set on insert/update (e.g. never straight to
-- "published") is enforced in application code, same as every other
-- fine-grained Admin Platform permission in this codebase — this
-- policy only guards row ownership + assignment + current stage.
create policy "workflow_statuses: assigned collaborator insert own" on public.workflow_statuses
  for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and (select private.has_workflow_access(entity_type, entity_id))
  );

create policy "workflow_statuses: assigned collaborator update own draft" on public.workflow_statuses
  for update
  to authenticated
  using (
    submitted_by = auth.uid()
    and status in ('draft', 'pending_review')
    and (select private.has_workflow_access(entity_type, entity_id))
  )
  with check (submitted_by = auth.uid());

grant select, insert, update on public.workflow_statuses to authenticated;

-- ============================================================
-- RLS — workflow_assignments
-- ============================================================
alter table public.workflow_assignments enable row level security;

create policy "workflow_assignments: own read" on public.workflow_assignments
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "workflow_assignments: staff manage" on public.workflow_assignments
  for all
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

grant select, insert, update, delete on public.workflow_assignments to authenticated;

commit;
