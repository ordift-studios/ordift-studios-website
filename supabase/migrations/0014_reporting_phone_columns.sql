-- Ordift Studios — operational reporting: phone column (2026-07-27)
--
-- Context: the new Admin Portal reporting workflow (search/filter/
-- export/email reports — see ADMIN_GUIDE.md's Operational Reporting
-- section) needs phone number as an operational column, same as the
-- Google Sheets secondary copy already has. Today `phone` is captured
-- on every form submission but was never persisted into Supabase's
-- `enquiries`/`workshop_registrations` tables — only into the Sheet —
-- so an administrator currently cannot see or export a submitter's
-- phone number from inside the Admin Portal at all. This is the one
-- column genuinely missing to make Supabase-backed reporting usable;
-- everything else the reporting feature needs (service, workshop,
-- status, payment status, submitted/registration date) already exists.
--
-- Deliberately minimal: one nullable column per table, no new tables,
-- no RLS policy changes (existing "read own" / "staff read all"
-- policies already cover whatever columns a table has — nothing about
-- adding a column changes who can read which rows). This is additive
-- only, same convention as every prior migration.

begin;

alter table public.enquiries
  add column phone text;

alter table public.workshop_registrations
  add column phone text;

commit;
