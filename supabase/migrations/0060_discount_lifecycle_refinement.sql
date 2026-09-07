-- Ordift Discount Lifecycle Refinement (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - Confirmed 0059 is the latest applied migration (local=remote=0059)
--     before writing this file — this migration is 0060.
--   - discount_codes (0053): already has an `active boolean` column,
--     used for the existing, fully non-destructive Deactivate/Activate
--     toggle (pricing.discount_code.active_changed) — that mechanism is
--     untouched and remains the correct path for a temporary/reusable
--     promotion (Christmas campaign, seasonal offer, etc.).
--   - discount_redemptions (0053) is the ONLY table in this entire
--     schema with a foreign key to discount_codes
--     (discount_redemptions.discount_code_id, declared with no ON
--     DELETE clause — i.e. Postgres default NO ACTION). No booking/
--     enquiry/quote/payment table holds a direct FK to discount_codes;
--     they relate to a redemption via discount_redemptions.reference_
--     type/reference_id, the same established polymorphic-reference
--     pattern as payment_obligations.source_type/source_reference. This
--     means a live COUNT against discount_redemptions.discount_code_id
--     is the complete, sufficient dependency check for "does deleting
--     this code touch financial/audit history" — confirmed by directly
--     reading the 0053 DDL (see supabase/migrations/0053_pricing_engine_v1.sql
--     lines ~229-291) before writing this migration, not assumed.
--   - This migration therefore adds exactly one column:
--     discount_codes.archived_at (nullable timestamptz). It is the
--     minimum coherent archival state needed to distinguish DEACTIVATE
--     (temporary, `active=false`, freely reactivatable) from DELETE-
--     attempted-but-history-protected (`active=false` AND
--     `archived_at` set — permanently retired, never reactivated, per
--     the application-layer guard in setDiscountCodeActive()). No new
--     table, no new enum type, no change to discount_redemptions or any
--     other table.
--   - RLS: discount_codes' existing "discount_codes: super admin read"
--     policy and service-role write grant already cover the new column
--     — no RLS statement needed for a single additive column on an
--     already-RLS-enabled table.
--   - WLCMBCK: a read-only dependency check (via `supabase db query
--     --linked`, non-destructive SELECT only) confirmed, immediately
--     before this migration was written, that the WLCMBCK discount code
--     (id aa8ab31d-e2b0-4171-b820-e567a0f61da1) has zero rows in
--     discount_redemptions referencing it. Its removal is performed
--     separately, through the application's new governed
--     deleteDiscountCode() path (which re-verifies the same zero-
--     redemption condition live at execution time, not merely trusting
--     this earlier read), not as a raw SQL statement in this migration
--     — a real Admin-authorized deletion belongs in the audited
--     application code path (logActivity + FINANCE_CAPABILITIES.
--     pricingAdminister), not a migration script.
--
-- 0001-0059 are not modified. The only statement below is a single
-- additive, nullable column. No destructive statement appears anywhere
-- in this file, and no row in discount_codes or discount_redemptions is
-- touched by this migration.

begin;

alter table public.discount_codes
  add column archived_at timestamptz;

comment on column public.discount_codes.archived_at is
  'Set only when an authorized Delete attempt found this code has redemption history (discount_redemptions.discount_code_id references it) — the code is retired instead of physically deleted, so financial/audit history is never destroyed. Distinct from the existing `active` toggle: a merely deactivated code (archived_at still null) remains freely reactivatable; an archived code (archived_at set) is never reactivated by the application layer, even though the row itself is preserved for Admin visibility and audit.';

commit;
