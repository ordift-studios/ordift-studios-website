-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 3 (2026-09-14) —
-- ATTENDANCE RECORDS (Ghana).
--
-- One row per (profile, date) tracking the Scheduled/Rostered ->
-- Actual -> Classification -> Explanation/Exception -> Approval/Review
-- pipeline (OS-HR-GH-002 Section 2). Facts are tracked SEPARATELY, not
-- collapsed into one mutually-exclusive status: is_late/is_early_departure/
-- is_rest_day_worked/is_public_holiday_worked/is_on_call are independent
-- booleans (a person can, for example, both check in late AND later work
-- overtime), exactly matching the explicit "track separately" instruction.
--
-- attendance_status = 'absent_authorized' or 'absent_unauthorized_confirmed'
-- can ONLY ever be set by a human review action
-- (reviewAttendanceException(), src/lib/organization/attendance.ts) — no
-- automatic classification path produces either value. This is a real,
-- database-independent guarantee only insofar as the application code
-- enforces it (RLS cannot express "which application function" wrote a
-- row); it is verified in this phase by code reading and by a real test
-- proving the pure classifier itself never returns those two statuses.
--
-- No salary/deduction logic exists anywhere in this migration or the
-- accompanying code — this table produces FACTS only, for a not-yet-built
-- payroll system to eventually consume. No automatic termination or
-- "X days absent = action" rule exists either (OS-HR-GH-002 7.2 /
-- OS-HR-GH-006 1.3 both explicitly prohibit this).

begin;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  attendance_date date not null,
  day_type text not null,
  scheduled_start_time time,
  scheduled_end_time time,
  actual_check_in timestamptz,
  actual_check_out timestamptz,
  attendance_status text not null default 'pending',
  is_late boolean not null default false,
  is_early_departure boolean not null default false,
  is_rest_day_worked boolean not null default false,
  is_public_holiday_worked boolean not null default false,
  is_on_call boolean not null default false,
  leave_request_id uuid references public.leave_requests (id),
  explanation_notes text,
  falsification_flagged boolean not null default false,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, attendance_date)
);

comment on table public.attendance_records is
  'One row per (profile, date). day_type: working_day | rest_day | public_holiday — the SCHEDULED classification for that date, never derived from attendance itself. attendance_status: pending | present | absent_unexplained | absent_authorized | absent_unauthorized_confirmed | on_leave | rest_day | public_holiday (unconstrained text, application-validated, same precedent as activity_log.action). absent_authorized/absent_unauthorized_confirmed are set ONLY by a human review action (reviewAttendanceException()) — never by the automatic classifier. is_late/is_early_departure/is_rest_day_worked/is_public_holiday_worked/is_on_call are independent facts, never conflated into attendance_status. No deduction, discipline, or termination logic exists in this table or its accompanying code — facts only.';
comment on column public.attendance_records.falsification_flagged is
  'A separate misconduct flag (OS-HR-GH-002 2.4: "Falsification is separate misconduct") — never itself a classification, never itself a consequence; a flag for a not-yet-built discipline workflow to reference.';

create index attendance_records_profile_date_idx on public.attendance_records (profile_id, attendance_date desc);
create index attendance_records_status_idx on public.attendance_records (attendance_status);

alter table public.attendance_records enable row level security;

create policy "attendance_records: read own or admin" on public.attendance_records
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.attendance_records to authenticated;
grant select, insert, update on public.attendance_records to service_role;

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

commit;
