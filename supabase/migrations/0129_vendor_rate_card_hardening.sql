-- Vendor Rate Card hardening (2026-09-16, backlog Phase 1 Item 2).
-- Closes the requested field gaps against migration 0126's existing
-- vendor_rate_cards/vendor_rate_card_items: equipment/facility charge
-- per item, card-level cancellation/rescheduling terms, and an
-- informational internal review/approval record. Strictly Vendor-cost
-- only — no markup/margin/client-price column added anywhere, no
-- quotation engine.

begin;

alter table public.vendor_rate_card_items
  add column if not exists equipment_facility_charge numeric(12, 2);

alter table public.vendor_rate_card_items
  add constraint vendor_rate_card_items_equipment_facility_charge_check
    check (equipment_facility_charge is null or equipment_facility_charge >= 0);

comment on column public.vendor_rate_card_items.equipment_facility_charge is 'Optional equipment/facility charge for this line item, Vendor cost only. Nullable — most items have none.';

alter table public.vendor_rate_cards
  add column if not exists cancellation_rescheduling_terms text,
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists reviewed_at timestamptz;

comment on column public.vendor_rate_cards.cancellation_rescheduling_terms is 'Card-wide cancellation/rescheduling commercial terms, as supplied by the vendor. Nullable — never guessed.';
comment on column public.vendor_rate_cards.reviewed_by is 'Informational internal-review record — who reviewed this card. Non-blocking: does not gate a card''s current/superseded status.';
comment on column public.vendor_rate_cards.reviewed_at is 'When reviewed_by reviewed this card. Set together with reviewed_by, never independently.';

commit;
