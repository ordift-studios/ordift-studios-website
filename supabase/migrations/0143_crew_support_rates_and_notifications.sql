-- Crew Support Phase 2 (2026-10-07): governed Crew Support selling-rate
-- architecture (EMPTY — no rates are seeded; the Founder will research and
-- configure them) and the client-notification event log.
--
-- SAFETY REVIEW: additive only (three new tables, no existing object
-- changed). All three are admin-read via RLS; writes are service_role only.
-- Nothing here stores crew pay, contractor/vendor cost or margin: these
-- are SELLING-side rates and a delivery log of client-safe messages.

begin;

-- Versioned, append-only (never UPDATE a price — insert a new row with a
-- later effective_from; reads take the most recent active row per key),
-- the same pattern as every other pricing family.
create table public.crew_support_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  operational_title_id uuid not null references public.operational_titles (id),
  unit_basis text not null check (unit_basis in ('hour', 'half_day', 'full_day')),
  price_usd numeric(12, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
comment on table public.crew_support_rates is
  'Governed Creative Crew Support SELLING rates (USD reference) per market x capability x unit. Intentionally empty on delivery. Not a cost table.';
create index crew_support_rates_lookup_idx on public.crew_support_rates (market_id, operational_title_id, unit_basis, effective_from desc);

create table public.crew_support_rate_modifiers (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.pricing_markets (id),
  modifier_slug text not null check (modifier_slug in ('urgent_uplift_percent', 'overtime_uplift_percent')),
  percentage numeric(6, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
comment on table public.crew_support_rate_modifiers is
  'Governed percentage modifiers for Crew Support quotes (market_id null = all markets). Intentionally empty on delivery.';
create index crew_support_rate_modifiers_lookup_idx on public.crew_support_rate_modifiers (modifier_slug, market_id, effective_from desc);

-- One row per (request, client-facing event). The unique key is the
-- idempotency guarantee: refreshes, repeated saves and retried calls can
-- never create a second row, so never a second email. Stores only
-- client-safe content (subject/plain text/template variables).
create table public.crew_support_notification_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.crew_support_requests (id) on delete cascade,
  event_key text not null,
  template text not null,
  recipient_email text not null,
  subject text,
  body_text text,
  template_vars jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'logged', 'failed', 'suppressed_test')),
  attempts integer not null default 0,
  error text,
  triggered_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, event_key)
);
comment on table public.crew_support_notification_events is
  'Client-facing Crew Support notification log and idempotency guard. suppressed_test = the request is a TEST/QA record, so the message was recorded but never delivered externally.';
create index crew_support_notification_events_request_idx on public.crew_support_notification_events (request_id, created_at desc);

alter table public.crew_support_rates enable row level security;
alter table public.crew_support_rate_modifiers enable row level security;
alter table public.crew_support_notification_events enable row level security;

create policy "crew_support_rates: admin read" on public.crew_support_rates
  for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "crew_support_rate_modifiers: admin read" on public.crew_support_rate_modifiers
  for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "crew_support_notification_events: admin read" on public.crew_support_notification_events
  for select to authenticated using ((select private.is_admin_or_super_admin()));

grant select on public.crew_support_rates, public.crew_support_rate_modifiers, public.crew_support_notification_events to authenticated;
grant select, insert, update, delete on public.crew_support_rates, public.crew_support_rate_modifiers, public.crew_support_notification_events to service_role;

commit;
