-- Crew Support post-confirmation cancellation record (2026-10-08).
--
-- Cancelling a request that is already Confirmed (or in production) has
-- financial consequences (a receivable, payments, crew payables), so it is
-- restricted to authorised management, needs a recorded justification, and
-- raises a FINANCIAL REVIEW that a finance approver must resolve. The
-- request keeps who/when/why and the review outcome. Nothing is deleted or
-- reversed automatically.
--
-- Additive: nullable columns plus a review status that defaults to
-- 'not_required' for every existing row.

begin;

alter table public.crew_support_requests
  add column cancellation_reason text,
  add column cancelled_by uuid references public.profiles (id),
  add column cancelled_at timestamptz,
  add column cancellation_review_status text not null default 'not_required',
  add column cancellation_review_note text,
  add column cancellation_review_by uuid references public.profiles (id),
  add column cancellation_review_at timestamptz;

alter table public.crew_support_requests
  add constraint crew_support_requests_cancel_review_status_check check (cancellation_review_status in ('not_required', 'pending', 'resolved')),
  add constraint crew_support_requests_cancel_review_resolved_check check (
    cancellation_review_status <> 'resolved'
    or (cancellation_review_note is not null and cancellation_review_by is not null and cancellation_review_at is not null)
  );

comment on column public.crew_support_requests.cancellation_review_status is
  'not_required (cancelled before any commitment) | pending (cancelled after confirmation: a finance approver must review the receivable, payments and crew payables) | resolved (reviewed, with note/by/at).';

commit;
