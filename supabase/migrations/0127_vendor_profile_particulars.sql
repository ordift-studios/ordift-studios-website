-- OS-LGL-009 Vendor & Supplier Framework Agreement — Vendor Profile
-- Particulars (2026-09-15). Founder-directed correction: the Framework
-- form was requiring Vendor Type / Registered Address / Contact Person
-- (and optionally Telephone / Registration Number / Tax Identifiers)
-- with no canonical place to record them once and reuse them — every
-- Framework draft would otherwise re-ask for the same facts. This adds
-- them directly to the existing public.vendor_profiles table (the
-- same "extend, don't duplicate" approach migration 0105 already used
-- for public.employing_entities) rather than a new table.
--
-- All six columns are nullable and carry no CHECK/NOT NULL constraint:
-- a genuine individual/sole-provider vendor may never have a
-- registration number or tax identifier, and that must remain
-- expressible, never forced. Requiredness for actually ISSUING an
-- OS-LGL-009A Framework (vendorType/registeredAddress/contactPerson
-- required; registrationNumber/telephone/taxIdentifiers optional)
-- continues to be enforced at the point of Framework creation
-- (createVendorFrameworkDraftAgreement(), vendorAgreements.ts) — never
-- at this table.
--
-- No RLS change needed: the existing "vendor_profiles: read own or
-- staff" / "vendor_profiles: staff update" policies (migration 0001,
-- 0002) are row-level and already cover these new columns. This
-- matches the vendor_documents precedent (migration 0122), which
-- already makes vendor registration/compliance evidence
-- staff-readable, not Super-Admin-only — unlike employing_entities'
-- OWN sensitive registration facts (migration 0105), which were split
-- into a separate Super-Admin-only table specifically because that
-- concern is Ordift's own internal registration secrecy, a different
-- sensitivity class from a vendor's own business particulars that the
-- vendor already discloses to Ordift as part of onboarding.

begin;

alter table public.vendor_profiles
  add column if not exists vendor_type text,
  add column if not exists registered_address text,
  add column if not exists contact_person text,
  add column if not exists telephone text,
  add column if not exists registration_number text,
  add column if not exists tax_identifiers text;

comment on column public.vendor_profiles.vendor_type is 'Free-text vendor category (e.g. Individual / Sole Provider / Company / Studio / Supplier / Other) — matches the OS-LGL-009A Schedule A "Vendor Type" field. Nullable: never guessed.';
comment on column public.vendor_profiles.registered_address is 'The vendor''s registered/business address, as the vendor itself supplied it. Nullable: never guessed.';
comment on column public.vendor_profiles.contact_person is 'The vendor''s named point of contact for this relationship. Nullable: never guessed.';
comment on column public.vendor_profiles.telephone is 'Vendor telephone/WhatsApp contact. Nullable — genuinely optional, not every vendor supplies one.';
comment on column public.vendor_profiles.registration_number is 'Vendor''s own business registration/incorporation number, where applicable. Nullable — a genuine individual/sole provider may have none; never required.';
comment on column public.vendor_profiles.tax_identifiers is 'Vendor''s own applicable tax/business identifier(s), where applicable. Nullable — never required for a category where it does not genuinely apply.';

commit;
