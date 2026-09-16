-- Connect Client Quotations to existing Pricing (2026-09-16). Additive
-- only — every existing client_quotation_items row defaults to
-- source_type='manual' (unchanged meaning: an authorized manual entry,
-- exactly what every row created so far already was).

begin;

alter table public.client_quotation_items
  add column if not exists source_type text not null default 'manual'
    check (source_type in ('pricing', 'manual', 'adjusted')),
  add column if not exists source_reference text;

comment on column public.client_quotation_items.source_type is
  'pricing = line item was prefilled from an existing Pricing engine rate (source_reference names which); manual = authorized freehand entry, no configured Pricing rate applied (e.g. a genuinely custom/bespoke scope); adjusted = started from a Pricing rate but the rate/terms were deliberately changed — source_reference still names the originating rate for audit context.';

comment on column public.client_quotation_items.source_reference is
  'Human-readable identifier of the originating Pricing record when source_type is pricing or adjusted (e.g. "Corporate Headshot Rates: individual_headshot, Ghana, effective 2026-08-05") — never a live foreign key, since a quotation item is a frozen snapshot that must survive the referenced rate later changing or being superseded.';

commit;
