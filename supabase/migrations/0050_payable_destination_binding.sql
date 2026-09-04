-- Phase G.4A (2026-09-04) — immutable payment-destination provenance
-- on payment_obligations. Purely additive: every new column is
-- nullable, no existing column/constraint/row is touched, and no
-- default value silently populates anything on existing rows.
--
-- payment_instruction_id already existed (migration 0046) as a live
-- FK to payment_instructions, but was never written by any code path
-- — this migration doesn't change that column at all, only adds the
-- columns needed to snapshot what a live payment_instructions row
-- said AT THE MOMENT it was selected for this specific obligation.
--
-- Design decision (typed columns, not JSONB) — see the Phase G.4
-- report: payment_instructions itself already proves a flat, typed,
-- generic column shape (method/institution_name/account_identifier)
-- handles every destination type this system supports without any
-- JSONB; mirroring that same proven shape here keeps real column
-- typing/referential integrity (destination_selected_by is a real FK
-- to profiles, not an untyped id buried in a blob), straightforward
-- SQL reporting (e.g. "how many payouts went via mobile money"), and
-- clean integration with a future payout_attempts table — all without
-- needing JSONB's schema flexibility, which nothing here actually
-- requires. This table has never used JSONB for any of its financial
-- fields (payout_provider/payout_reference are already plain typed
-- columns); this stays consistent with that.
--
-- destination_method/destination_institution_name/
-- destination_account_holder_name/destination_masked_identifier are
-- non-secret snapshot data (the admin UI already displays all of
-- these unmasked or masked today) — never the decrypted or encrypted
-- account/routing identifier itself, which this migration does not
-- duplicate anywhere.
alter table public.payment_obligations
  add column destination_method text,
  add column destination_institution_name text,
  add column destination_account_holder_name text,
  add column destination_masked_identifier text,
  add column destination_verification_status_at_selection text,
  add column destination_selected_at timestamptz,
  add column destination_selected_by uuid references public.profiles (id);

comment on column public.payment_obligations.destination_method is
  'Snapshot of payment_instructions.method at the moment a destination was selected for this obligation — immutable once set, never re-derived from the live row. Null until a destination has been explicitly selected.';
comment on column public.payment_obligations.destination_masked_identifier is
  'Masked (last-4-only) snapshot, e.g. "****5345" — never the decrypted or encrypted full identifier. Captured once, at selection time, so later edits to the live payment_instructions row can never silently rewrite this payable''s historical record of where it was actually paid.';
comment on column public.payment_obligations.destination_selected_by is
  'The actor who selected/confirmed this destination for this obligation — distinct from approved_by and created_by.';
