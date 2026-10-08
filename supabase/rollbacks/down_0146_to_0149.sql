-- ROLLBACK for migrations 0146–0149 ONLY (Production plan).
-- Production already runs 0144 and 0145 live (amount-due provenance, crew
-- acceptance, agreement-required, one-engagement-per-slot) — those are NOT
-- touched here. NOT a migration: it lives outside supabase/migrations so
-- `db push` never runs it. Run manually in ONE transaction only if 0146–0149
-- must be backed out, then:
--   supabase migration repair --status reverted 0146 0147 0148 0149
-- It DISCARDS data held in the new columns (offers, payment conditions,
-- snapshots, cancellation reviews). The guard below refuses to run if that
-- would conflict with existing rows. A CODE-only problem needs no SQL: roll
-- the Vercel deployment back instead (the old code works with the new schema).
begin;

do $$
begin
  if exists (select 1 from public.crew_support_requests where status in ('in_production', 'completed')) then
    raise exception 'Rollback refused: requests exist in the in_production/completed statuses (0146 lifecycle).';
  end if;
  if exists (select 1 from public.client_quotations where is_variation) then
    raise exception 'Rollback refused: variation quotations exist (0147). Resolve or remove them first.';
  end if;
end $$;

-- 0149 offers
alter table public.crew_support_slots drop constraint if exists crew_support_slots_offer_check;
alter table public.crew_support_slots
  drop column if exists offer_amount, drop column if exists offer_currency, drop column if exists offer_message,
  drop column if exists offered_at, drop column if exists offered_by, drop column if exists crew_response_at,
  drop column if exists crew_response_note, drop column if exists crew_instructions;

-- 0148 cancellation review
alter table public.crew_support_requests
  drop constraint if exists crew_support_requests_cancel_review_resolved_check,
  drop constraint if exists crew_support_requests_cancel_review_status_check;
alter table public.crew_support_requests
  drop column if exists cancellation_reason, drop column if exists cancelled_by, drop column if exists cancelled_at,
  drop column if exists cancellation_review_status, drop column if exists cancellation_review_note,
  drop column if exists cancellation_review_by, drop column if exists cancellation_review_at;

-- 0147 payment conditions + variations (restore the single-live-quotation index)
drop index if exists public.client_quotations_one_live_variation_per_crew_request;
drop index if exists public.client_quotations_one_live_per_crew_request;
create unique index client_quotations_one_live_per_crew_request
  on public.client_quotations (crew_support_request_id)
  where crew_support_request_id is not null and status in ('draft', 'ready', 'sent', 'accepted');
alter table public.client_quotations
  drop constraint if exists client_quotations_deposit_range_check,
  drop constraint if exists client_quotations_deposit_percent_check,
  drop constraint if exists client_quotations_payment_condition_check;
alter table public.client_quotations drop column if exists payment_condition, drop column if exists deposit_percent, drop column if exists is_variation;

-- 0146 lifecycle + snapshot + override
alter table public.crew_support_slots drop constraint if exists crew_support_slots_override_check;
alter table public.crew_support_slots drop column if exists assignment_override_reason, drop column if exists assignment_override_by, drop column if exists assignment_override_at;
alter table public.client_quotations drop column if exists project_snapshot;
alter table public.crew_support_requests drop constraint if exists crew_support_requests_status_check;
alter table public.crew_support_requests add constraint crew_support_requests_status_check
  check (status in ('received', 'under_review', 'availability_review', 'quote_preparation', 'quoted', 'agreement_pending', 'payment_pending', 'confirmed', 'declined', 'cancelled'));

commit;
