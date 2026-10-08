-- Crew Support payment conditions + quotation variations (2026-10-08).
--
-- INSPECTION SUMMARY:
--   - Payments (0024+) already model deposits/partials/balances/refunds
--     against enquiries.amount_due, with amount_paid derived in USD from
--     completed payments minus refunds (gatewaySync.syncEntityPaymentStatus)
--     for both Paystack and verified manual transfers. What was missing
--     was a *commercial condition* saying whether a payment must be made
--     BEFORE a Crew Support request can be confirmed. It belongs on the
--     quotation (an issued quotation is immutable, so the condition the
--     client accepted can never silently change).
--   - An accepted quotation must never be overwritten. A change after
--     acceptance is a VARIATION: a complete replacement quotation (new
--     row, version + 1, supersedes_id set) that only takes effect when the
--     client accepts it. The one-live-quotation-per-request index would
--     forbid a variation coexisting with the accepted original, so it is
--     split: one live ORIGINAL per request, and one live VARIATION per
--     request.
--
-- Additive and backward compatible: defaults keep every existing quotation
-- exactly as it is (payment_condition 'none', not a variation). The only
-- drop is the old unique index, replaced in the same transaction by the
-- narrower pair above (no data touched).

begin;

alter table public.client_quotations
  add column payment_condition text not null default 'none',
  add column deposit_percent numeric(5, 2),
  add column is_variation boolean not null default false;

alter table public.client_quotations
  add constraint client_quotations_payment_condition_check check (payment_condition in ('none', 'deposit', 'full')),
  add constraint client_quotations_deposit_percent_check check ((payment_condition = 'deposit') = (deposit_percent is not null)),
  add constraint client_quotations_deposit_range_check check (deposit_percent is null or (deposit_percent > 0 and deposit_percent <= 100));

comment on column public.client_quotations.payment_condition is
  'Whether a payment is contractually required BEFORE the Crew Support request can be confirmed: none | deposit (deposit_percent of the accepted USD total) | full. Set before issue; frozen once issued. Enforced at confirmation against enquiries.amount_paid.';
comment on column public.client_quotations.is_variation is
  'True for a replacement quotation created after the original was accepted. It takes effect only when the client accepts it; the accepted original is never edited and becomes superseded at that moment.';

drop index if exists public.client_quotations_one_live_per_crew_request;
create unique index client_quotations_one_live_per_crew_request
  on public.client_quotations (crew_support_request_id)
  where crew_support_request_id is not null and is_variation = false and status in ('draft', 'ready', 'sent', 'accepted');
create unique index client_quotations_one_live_variation_per_crew_request
  on public.client_quotations (crew_support_request_id)
  where crew_support_request_id is not null and is_variation = true and status in ('draft', 'ready', 'sent');

commit;
