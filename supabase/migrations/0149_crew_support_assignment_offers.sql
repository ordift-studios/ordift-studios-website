-- Crew Support assignment offers and crew-side response (2026-10-08).
--
-- INSPECTION SUMMARY:
--   - A slot's status already had proposed / assigned / declined, and 0145
--     added the crew-acceptance record (crew_accepted_at/via/recorded_by/
--     note). What was missing was the OFFER itself (what the person is
--     being offered and by whom) and the crew member's own response, so
--     that acceptance is genuinely the crew member's act in the portal and
--     never an administrator's substitute.
--   - The agreed compensation still lives on the person's engagement
--     (created from the offer when, and only when, the crew member
--     accepts). The offer columns here are the *proposal*, not a ledger.
--   - crew_instructions are staff-written, job-specific instructions shown
--     only to the accepted crew member (their assignment page), so crew
--     never need access to the client's workspace.
--
-- Additive: nullable columns, no data touched.

begin;

alter table public.crew_support_slots
  add column offer_amount numeric(14, 2),
  add column offer_currency text,
  add column offer_message text,
  add column offered_at timestamptz,
  add column offered_by uuid references public.profiles (id),
  add column crew_response_at timestamptz,
  add column crew_response_note text,
  add column crew_instructions text;

alter table public.crew_support_slots
  add constraint crew_support_slots_offer_check check (
    (offer_amount is null and offer_currency is null)
    or (offer_amount > 0 and offer_currency ~ '^[A-Z]{3}$' and offered_at is not null and offered_by is not null)
  );

comment on column public.crew_support_slots.offer_amount is
  'Compensation OFFERED to the proposed person (their own pay — never the client price). Becomes the engagement''s agreed amount only when the person accepts.';

commit;
