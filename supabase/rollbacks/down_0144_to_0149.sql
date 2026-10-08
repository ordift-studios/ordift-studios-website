-- ROLLBACK for migrations 0144–0149 (Crew Support commitment layer).
-- NOT a migration: it lives outside supabase/migrations so `db push` never
-- runs it. Run manually, in ONE transaction, only if those migrations must
-- be backed out, then `supabase migration repair --status reverted
-- 0144 0145 0146 0147 0148 0149`.
--
-- It DISCARDS the data held in the new columns (offers, acceptance, payment
-- conditions, snapshots, cancellation reviews...). The guards below refuse
-- to run if doing so would orphan or conflict with existing rows.
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

-- 0145 commitments
drop index if exists public.engagements_one_live_per_crew_slot;
alter table public.crew_support_requests drop constraint if exists crew_support_requests_agreement_required_check;
alter table public.crew_support_requests
  drop column if exists agreement_required, drop column if exists agreement_required_reason,
  drop column if exists agreement_required_by, drop column if exists agreement_required_at;
alter table public.crew_support_slots drop constraint if exists crew_support_slots_acceptance_check, drop constraint if exists crew_support_slots_acceptance_via_check;
alter table public.crew_support_slots
  drop column if exists crew_accepted_at, drop column if exists crew_accepted_via,
  drop column if exists crew_accepted_recorded_by, drop column if exists crew_acceptance_note;

-- 0144 receivable provenance
drop index if exists public.enquiries_amount_due_quotation_idx;
alter table public.enquiries drop constraint if exists enquiries_amount_due_provenance_check, drop constraint if exists enquiries_amount_due_source_check;
alter table public.enquiries drop column if exists amount_due_source, drop column if exists amount_due_quotation_id;

commit;
