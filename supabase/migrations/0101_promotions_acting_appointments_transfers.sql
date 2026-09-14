-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 16 (2026-09-14) —
-- PROMOTION, ACTING APPOINTMENTS AND TRANSFERS (Ghana), OS-HR-GH-003
-- section 8.
--
-- All three decision records here are deliberately separate from the
-- ACTUAL application of a position/grade/entity/department change —
-- that already exists (employment_terms_history, migration 0086,
-- recordEmploymentTermsSnapshot()). A promotion/acting appointment/
-- transfer table here records the DECISION and its approvals; applying
-- the change itself reuses the existing effective-dated snapshot
-- mechanism (careerMovements.ts) rather than duplicating position/
-- grade/entity columns as a second source of truth.

begin;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  from_position_id uuid references public.positions (id),
  to_position_id uuid references public.positions (id),
  from_grade_id uuid references public.grades (id),
  to_grade_id uuid references public.grades (id),
  basis text not null,
  remuneration_review_required boolean not null,
  remuneration_review_completed boolean not null default false,
  remuneration_review_notes text,
  effective_date date not null,
  approved_by uuid not null references public.profiles (id),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.promotions is
  'OS-HR-GH-003 8.1: "Promotion is based on performance, capability, qualifications, responsibility, business need, role availability, conduct/attendance and approval. Time served alone does not guarantee promotion." basis is a required free-text account of which of those factors applied — never a single invented category, since 8.1 lists multiple simultaneous considerations. remuneration_review_required is computed server-side (recordPromotion(), src/lib/organization/careerMovements.ts) as true whenever to_grade_id differs from from_grade_id — "A grade change triggers remuneration review" — never a caller-supplied value. "but no predetermined increase" (8.1): this table has no reward/increase-amount column of any kind; any actual remuneration change is a separate, later, explicit employment_terms_history snapshot (migration 0086) with its own basic_salary value, never derived automatically from this row.';

create index promotions_profile_idx on public.promotions (profile_id);

alter table public.promotions enable row level security;

create policy "promotions: read own or admin" on public.promotions
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.promotions to authenticated;
grant select, insert, update on public.promotions to service_role;

create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

create table public.acting_appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  acting_position_id uuid references public.positions (id),
  responsibilities text not null,
  reporting_to uuid references public.profiles (id),
  temporary_permissions text,
  start_date date not null,
  end_date date,
  acting_allowance_amount numeric,
  allowance_approved_by uuid references public.profiles (id),
  allowance_approved_at timestamptz,
  status text not null default 'active',
  ended_at timestamptz,
  ended_reason text,
  approved_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.acting_appointments is
  'OS-HR-GH-003 8.2: "Sustained higher/different duties may be formalized through a temporary Acting Appointment stating position, responsibilities, dates, reporting and temporary permissions." acting_allowance_amount is nullable — "An acting allowance is optional and separately approved" — allowance_approved_by/allowance_approved_at are only ever set together with a non-null amount. status: active | ended. "Temporary authority/allowance ends with the acting appointment unless a new decision is made" (8.2): endActingAppointment() (src/lib/organization/careerMovements.ts) is the only function that sets status=ended, and any continuation beyond the original end_date requires a genuinely new decision (a new row, or an explicit extension), never an automatic rollover of this one.';

create index acting_appointments_profile_idx on public.acting_appointments (profile_id);

alter table public.acting_appointments enable row level security;

create policy "acting_appointments: read own or admin" on public.acting_appointments
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.acting_appointments to authenticated;
grant select, insert, update on public.acting_appointments to service_role;

create trigger acting_appointments_set_updated_at
  before update on public.acting_appointments
  for each row execute function public.set_updated_at();

create table public.staff_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  transfer_type text not null,
  from_employing_entity_id uuid references public.employing_entities (id),
  to_employing_entity_id uuid references public.employing_entities (id),
  from_department_id uuid references public.departments (id),
  to_department_id uuid references public.departments (id),
  written_notice_provided boolean not null default false,
  material_consent_obtained boolean not null default false,
  enhanced_review_completed boolean not null default false,
  status text not null default 'requested',
  effective_date date,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_transfers_type_check check (transfer_type in ('same_entity_same_jurisdiction', 'inter_entity', 'international'))
);

comment on table public.staff_transfers is
  'transfer_type is constrained to OS-HR-GH-003 8.3''s exact real three categories. status: requested | approved | completed. For inter_entity/international transfers, completeStaffTransfer() (src/lib/organization/careerMovements.ts) requires enhanced_review_completed=true as an actual precondition — 8.3: "Inter-entity or international transfers require enhanced review." "must not silently change employer, immigration/work authorization, payroll, tax, benefits or governing law" (8.3): completing a transfer always calls the existing recordEmploymentTermsSnapshot() (employmentTermsHistory.ts, migration 0086) as an explicit, auditable, new snapshot row — an entity/department change is never applied silently as a side effect of anything else in this system.';

create index staff_transfers_profile_idx on public.staff_transfers (profile_id);

alter table public.staff_transfers enable row level security;

create policy "staff_transfers: read own or admin" on public.staff_transfers
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.staff_transfers to authenticated;
grant select, insert, update on public.staff_transfers to service_role;

create trigger staff_transfers_set_updated_at
  before update on public.staff_transfers
  for each row execute function public.set_updated_at();

commit;
