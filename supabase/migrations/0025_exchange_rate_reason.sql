-- Ordift Studios — Exchange Rate Management: reason column (2026-08-07)
--
-- Additive, single-column change to the append-only public.exchange_rates
-- table (migration 0024). Supports the Admin Platform's new Exchange
-- Rate Management screen, where an authorized admin can optionally
-- record why a new USD -> GHS rate was entered (e.g. "aligning with
-- today's Bank of Ghana mid-rate"). Nullable — a rate entry never
-- requires a reason, matching how review_notes on payments is
-- optional-unless-rejecting, not mandatory everywhere.
--
-- No RLS change needed: the existing policies already enforce exactly
-- what the approved design calls for —
--   "exchange_rates: readable by authenticated" (select, true) lets any
--   signed-in user (including the admin history list) read every row;
--   "exchange_rates: staff insert" (insert, is_staff_or_admin()) lets
--   staff-tier-and-above append a new row;
--   no update/delete policy exists at all, which means Postgres RLS
--   denies both by default — historical rows are already physically
--   un-editable and un-deletable through PostgREST/the app, with zero
--   new policy work required to guarantee that.
-- App-layer capability gating (manage_currencies, admin/super_admin
-- only) narrows the insert further than the DB policy allows, the same
-- belt-and-suspenders pattern already used for approve/reject_bank_transfer.

alter table public.exchange_rates
  add column reason text;

comment on column public.exchange_rates.reason is
  'Optional free-text note explaining why this rate was entered — shown in the admin history list, never required.';
