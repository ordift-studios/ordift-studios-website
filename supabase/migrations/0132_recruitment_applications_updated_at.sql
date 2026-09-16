-- Fix: recruitment_applications status-update failure (2026-09-16).
--
-- 0036 attached the standard `recruitment_applications_set_updated_at`
-- trigger (public.set_updated_at(), `new.updated_at = now()`) but never
-- added an `updated_at` column to the table. Every UPDATE — including
-- the admin Save Status action — has therefore failed Production-wide
-- since the table was created, with Postgres raising "record \"new\"
-- has no field \"updated_at\"" inside the trigger. The application
-- code (updateRecruitmentApplicationStatus) was never the defect; it
-- correctly surfaces the DB error as "Couldn't update status."
--
-- Fix: add the missing column, matching every other trigger-bearing
-- table in this schema, rather than removing the trigger.

begin;

alter table public.recruitment_applications
  add column updated_at timestamptz not null default now();

commit;
