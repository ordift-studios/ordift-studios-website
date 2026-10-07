-- Receivable provenance (2026-10-07).
--
-- INSPECTION SUMMARY:
--   - enquiries.amount_due (0001) is a bare numeric. For Creative Crew
--     Support it is set from the accepted quotation's USD total, but the
--     relationship to that quotation existed ONLY in activity_log
--     metadata — not durable, not queryable, easy to lose.
--   - No existing column or table records where an amount_due came from.
--     (payments rows reference the enquiry via entity_type/entity_id, not
--     the quotation.)
--
-- This migration adds the smallest durable relationship:
--   amount_due_source          what produced the number
--   amount_due_quotation_id    the authoritative accepted quotation, when
--                              the source is accepted_quotation
--
-- Backward compatible and non-destructive: both columns are nullable, no
-- existing row is modified, and NO backfill is performed — historical
-- amounts keep NULL (legacy/unknown) rather than having provenance
-- inferred from activity logs. The foreign key is ON DELETE RESTRICT so a
-- quotation that backs a receivable can never be deleted out from under
-- it. Superseding/voiding/refunding never rewrites this link; those
-- remain separate, audited records.

begin;

alter table public.enquiries
  add column amount_due_source text,
  add column amount_due_quotation_id uuid references public.client_quotations (id) on delete restrict;

alter table public.enquiries
  add constraint enquiries_amount_due_source_check
    check (amount_due_source is null or amount_due_source in ('accepted_quotation', 'manual', 'other')),
  add constraint enquiries_amount_due_provenance_check
    check (amount_due_quotation_id is null or amount_due_source = 'accepted_quotation');

create index enquiries_amount_due_quotation_idx
  on public.enquiries (amount_due_quotation_id)
  where amount_due_quotation_id is not null;

comment on column public.enquiries.amount_due_source is
  'Where amount_due came from: accepted_quotation (see amount_due_quotation_id) | manual (staff typed it) | other. NULL = legacy/unknown — historical rows are deliberately not back-filled.';
comment on column public.enquiries.amount_due_quotation_id is
  'The accepted client_quotations row that established amount_due. Set only together with amount_due_source = accepted_quotation, only by the quotation-acceptance path. Never inferred from activity logs.';

commit;
