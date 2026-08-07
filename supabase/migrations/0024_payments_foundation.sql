-- Ordift Studios — Payments & Finance Module Foundation (proposed, 2026-08-06)
--
-- DRAFT — presented for review alongside PAYMENT_FINANCE_ARCHITECTURE_
-- PROPOSAL.md. NOT applied to staging or production. Do not run this
-- migration until the architecture document has been approved.
--
-- Scope: a platform-level payments service for Ordift Studios (incl.
-- Royce Model Management as an internal department, not a separate
-- business_id) — not a multi-tenant finance system. Every table
-- defaults business_id to Ordift Studios, matching every existing
-- table in this schema; no second businesses row is introduced.
--
-- USD is the reference currency (see the architecture doc §2): every
-- payment records the original USD-quoted amount, the currency and
-- rate actually used to convert it, and the amount collected —
-- because neither Paystack, MyFatoorah, nor Dibsy settles in USD to
-- Ordift's account, conversion is Ordift's own responsibility, locked
-- once per checkout session and never silently changed after. Phase 1
-- uses an admin-controlled rate (staff-entered in the Admin Platform,
-- exchange_rate_source = 'ordift') rather than an automatic FX-data
-- API — see the architecture doc §2's 2026-08-06 revision.
--
-- entity_type/entity_id is the same polymorphic pattern already used
-- by workflow_statuses (0023), activity_log, deliverables, and
-- project_requests — so future payable entities (invoices, studio
-- rentals, subscriptions) attach without altering this table's shape.
-- Reserved-for-later features (discounts, promo codes, gift cards,
-- tax, vendor payouts) are explicitly NOT built here — see the
-- architecture doc §12 for how each would plug in later.
--
-- 2026-08-06 revision: added channel/card_brand/card_last4 (safe,
-- masked payment metadata only — never a raw card number or CVV,
-- see PAYMENT_SECURITY_REVIEW.md §3) and the payment_webhook_events
-- table (full webhook history for reconciliation/audit, distinct
-- from payments' current-state view), per the Ghana payment-method
-- scope clarification (Mobile Money + Card + Apple Pay, Google Pay
-- reserved-not-shown).
--
-- 2026-08-06 revision 2 (pre-staging architecture review — 5-10 year
-- Finance-module lens, not yet applied anywhere): renamed
-- quoted_amount_usd -> reference_amount_usd (reads correctly once real
-- Quotation/Invoice documents exist and this column is neither);
-- added related_type/related_id (a SECOND, optional polymorphic
-- reference, distinct from entity_type/entity_id — see the payments
-- table's own comment below for the difference); added business_unit
-- (lightweight service-line classification for future revenue
-- reporting — NOT a tenant/business_id, per the standing single-
-- business-boundary rule); added tax_amount_usd (promised in the
-- architecture doc's §4 narrative, actually added now); added
-- posted_at (reserved for a future general-ledger integration — see
-- the new "Reserved for Future Accounting Ledger" section at the
-- bottom of this file); added a matching CHECK constraint to
-- exchange_rate_source (it was missing one while conversion_
-- performed_by, the same enum, had one — an inconsistency, now
-- fixed); and converted exchange_rates from a single-current-row-per-
-- currency table into an append-only rate history, since switching
-- that shape *after* real rate data and dependent application code
-- exist is the one item in this review that's genuinely more costly
-- to defer than to do now.

begin;

-- ============================================================
-- currencies — reference lookup. Config-driven expansion: a new
-- currency is a row insert, never a schema change.
-- ============================================================
create table public.currencies (
  code text primary key, -- ISO 4217, e.g. 'USD', 'GHS', 'QAR'
  name text not null,
  symbol text not null,
  is_active boolean not null default true
);

insert into public.currencies (code, name, symbol) values
  ('USD', 'US Dollar', '$'),
  ('GHS', 'Ghanaian Cedi', 'GH₵'),
  ('QAR', 'Qatari Riyal', 'QR');

-- ============================================================
-- bank_accounts — for the manual bank-transfer payment method.
-- Ghana row can be added immediately; Qatar row simply doesn't
-- exist (or stays is_active=false) until that account is created —
-- the checkout UI is expected to only offer countries with an
-- active row here.
-- ============================================================
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  country text not null, -- 'GH' | 'QA' (ISO 3166-1 alpha-2), extend freely later
  currency_code text not null references public.currencies (code),
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  iban text,
  swift_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_accounts_country_idx on public.bank_accounts (country) where is_active;

create trigger set_bank_accounts_updated_at
  before update on public.bank_accounts
  for each row execute function public.set_updated_at();

-- ============================================================
-- exchange_rates — the admin-controlled USD -> currency rate,
-- per the architecture doc §2's 2026-08-06 revision (admin-set,
-- not an automatic FX-data API, for Phase 1). Append-only history
-- (revised in the pre-staging architecture review): setting a new
-- rate INSERTs a row rather than overwriting the previous one, so
-- future financial reporting (e.g. valuing outstanding balances at
-- day-end rates, average effective FX rate over a period) has real
-- history to query — the per-transaction lock on payments.exchange_
-- rate still covers per-transaction audit, this covers "what was the
-- rate on any given day" independent of whether a transaction
-- happened that day. current_exchange_rates (view, below) is what
-- checkout and the Admin Platform actually read from day to day —
-- application code should essentially never need to know this is a
-- history table underneath.
-- ============================================================
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null references public.currencies (code),
  rate_to_usd numeric(14, 6) not null, -- 1 USD = rate_to_usd units of currency_code
  effective_from timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index exchange_rates_currency_effective_idx on public.exchange_rates (currency_code, effective_from desc);

insert into public.exchange_rates (currency_code, rate_to_usd) values
  ('USD', 1.000000);
-- GHS/QAR rows intentionally left unseeded — staff enters the first
-- real rate via the Admin Platform before Phase 2 checkout can go
-- live; no placeholder rate is inserted here to avoid a wrong number
-- ever being live by accident.

-- security_invoker so the view runs under the querying user's own
-- RLS, not the view owner's — the "readable by any authenticated
-- user" policy on exchange_rates itself (below) is what actually
-- governs access either way, but this is the correct default for any
-- view over an RLS-enabled table (Postgres 15+ recommended practice).
create view public.current_exchange_rates
  with (security_invoker = true) as
  select distinct on (currency_code) currency_code, rate_to_usd, effective_from, updated_by
  from public.exchange_rates
  order by currency_code, effective_from desc;

-- ============================================================
-- payment_country_config — country -> default currency -> gateway
-- provider mapping. Adding a country later (or changing which
-- gateway serves a country) is a row insert/update, not a schema
-- or code-path change, per the gateway-agnostic architecture.
-- ============================================================
create table public.payment_country_config (
  country text primary key, -- ISO 3166-1 alpha-2
  default_currency_code text not null references public.currencies (code),
  gateway_provider text not null, -- 'paystack' | 'myfatoorah' | 'dibsy' | etc.
  is_active boolean not null default true
);

insert into public.payment_country_config (country, default_currency_code, gateway_provider) values
  ('GH', 'GHS', 'paystack');
-- Qatar row intentionally omitted until the gateway decision (see
-- architecture doc §6/§13) and the Qatar bank account both exist.

-- ============================================================
-- payments — one row per transaction/attempt. Polymorphic against
-- any payable entity; supports the full deposit/partial/balance/
-- full/refund lifecycle plus the manual bank-transfer-with-proof
-- workflow, in one table.
-- ============================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  record_id text unique, -- human-readable reference, reuses the existing Record ID standard (src/lib/shared/recordId.ts)

  -- What's being paid for — always required. New entity_type values
  -- (invoice, subscription, studio_rental, ...) attach later without
  -- a migration — see architecture doc §4.
  entity_type text not null, -- 'enquiry' | 'workshop_registration' | future values
  entity_id text not null,

  -- What governing financial construct produced this payment, if any
  -- — distinct from entity_type/entity_id above (added in the
  -- pre-staging architecture review). entity_type/entity_id answers
  -- "what is this settling" (a booking, an enquiry); related_type/
  -- related_id optionally answers "what scheduled or generated this
  -- specific payment" — a future subscription's billing cycle, an
  -- installment plan's scheduled charge, a payment link, a gift-card
  -- redemption. Nullable and unconstrained on purpose: every one of
  -- those future features reuses this pair without ever altering
  -- payments again, the whole point of adding it now rather than
  -- adding a bespoke *_id column per future feature.
  related_type text,
  related_id text,

  -- Lightweight service-line classification for future revenue-by-
  -- service reporting (e.g. 'photography', 'royce_model_management',
  -- 'studio_rental') — NOT a tenant or business_id; the platform
  -- stays single-business per the standing boundary rule. Nullable;
  -- backfilling exact values for historical rows later is possible
  -- but annoying, so populated from Phase 2 onward where known.
  business_unit text,

  -- Who is paying — denormalized here (not resolved via the
  -- polymorphic parent) so client-facing "my payment history" and
  -- RLS stay simple. Nullable: a staff-recorded offline/manual
  -- entry may not have an associated portal account.
  user_id uuid references public.profiles (id),

  -- USD-reference / local-settlement currency model — see
  -- architecture doc §2 for why every one of these fields exists.
  -- Renamed from quoted_amount_usd (pre-staging architecture review)
  -- — "quoted" read ambiguously once real Quotation/Invoice documents
  -- exist and this column is neither; it's simply the USD amount this
  -- specific payment references.
  reference_amount_usd numeric(12, 2) not null,
  payment_currency text not null references public.currencies (code),
  exchange_rate numeric(14, 6) not null,
  -- Where the RATE NUMBER came from — distinct from
  -- conversion_performed_by below (who actually executed the
  -- conversion action). Same enum, deliberately kept as two columns
  -- per your explicit requirement; the CHECK constraint here was
  -- missing relative to conversion_performed_by's — fixed in the
  -- pre-staging review for consistency.
  exchange_rate_source text not null check (exchange_rate_source in ('ordift', 'gateway', 'issuing_bank', 'other')),
  exchange_rate_locked_at timestamptz not null,
  converted_amount numeric(12, 2) not null, -- reference_amount_usd * exchange_rate, shown to the customer pre-confirmation
  amount_collected numeric(12, 2), -- null until the payment actually completes
  settlement_currency text references public.currencies (code),
  gateway_fee numeric(12, 2),
  net_amount_received numeric(12, 2),
  -- Who actually performed the USD->local conversion — may differ
  -- from exchange_rate_source in a future gateway that handles its
  -- own multi-currency settlement (see the column comment above).
  conversion_performed_by text not null default 'ordift' check (conversion_performed_by in ('ordift', 'gateway', 'issuing_bank', 'other')),

  -- Reserved, not calculated or wired to any logic yet — added now
  -- (promised in the architecture doc, actually added in the
  -- pre-staging review) because it's free (nullable) and avoids a
  -- future migration the moment a tax feature is scoped.
  tax_amount_usd numeric(12, 2),

  -- Lifecycle
  payment_type text not null check (payment_type in ('deposit', 'partial', 'balance', 'full', 'refund')),
  payment_method text not null check (payment_method in ('gateway', 'bank_transfer')),
  status text not null default 'pending' check (
    status in ('pending', 'awaiting_verification', 'completed', 'failed', 'refunded', 'rejected')
  ),

  -- Gateway linkage
  provider text not null, -- 'paystack' | 'myfatoorah' | 'dibsy' | 'bank_transfer'
  gateway_reference text,
  idempotency_key text unique, -- reuses src/lib/shared/idempotency.ts for webhook double-processing protection

  -- Safe payment metadata only (PAYMENT_SECURITY_REVIEW.md §3/§23) — never
  -- a raw card number, CVV, or reusable card credential. channel/card_brand/
  -- card_last4 come directly off Paystack's own webhook payload, which
  -- already returns only masked/summary card data, never the full PAN.
  channel text, -- 'mobile_money' | 'card' | 'bank' | 'apple_pay' | 'google_pay', as reported by the gateway
  card_brand text, -- e.g. 'visa', 'mastercard' — null for non-card channels
  card_last4 text, -- last 4 digits only, as returned by the gateway — never a full card number

  -- Manual bank-transfer workflow (mirrors workflow_statuses'
  -- submitted_by/reviewed_by/review_notes shape, 0023)
  proof_of_payment_asset_path text, -- Supabase Storage path
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_notes text,

  -- Reserved for a future general-ledger integration (see the
  -- "Reserved for Future Accounting Ledger" section at the bottom of
  -- this file) — null means "not yet posted to the ledger." No
  -- ledger/chart-of-accounts table exists yet; this is the one
  -- attachment point future bookkeeping needs on this table, and it's
  -- free (nullable, unused) to add now versus a migration later.
  posted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_entity_idx on public.payments (entity_type, entity_id);
create index payments_related_idx on public.payments (related_type, related_id) where related_type is not null;
create index payments_user_idx on public.payments (user_id);
create index payments_status_idx on public.payments (status);
create index payments_provider_idx on public.payments (provider);
create index payments_business_unit_idx on public.payments (business_unit) where business_unit is not null;

create trigger set_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ============================================================
-- payment_webhook_events — a full, append-only log of every webhook
-- received from every provider, independent of the current-state
-- payments row. This is what PAYMENT_SECURITY_REVIEW.md §6/§7 and
-- this review's "webhook events" / "reconciliation records" metadata
-- requirement actually point at: payments holds current state,
-- this table holds full history for reconciliation, replay-window
-- checks, and incident investigation. raw_payload is stored with
-- sensitive fields never present in the first place (Paystack's own
-- webhook payload never includes a full PAN/CVV — see §1), not
-- redacted after the fact.
-- ============================================================
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments (id), -- nullable: a webhook that fails to match any known payment is still logged
  provider text not null,
  event_type text not null, -- provider's own event name, e.g. 'charge.success'
  gateway_reference text,
  signature_valid boolean not null,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index payment_webhook_events_payment_idx on public.payment_webhook_events (payment_id);
create index payment_webhook_events_received_idx on public.payment_webhook_events (received_at);

-- ============================================================
-- RLS — currencies / bank_accounts / payment_country_config /
-- exchange_rates are reference data: readable by any authenticated
-- user (needed for checkout to display bank details, currency
-- options, and the current rate), writable only by staff/admin.
-- ============================================================
alter table public.currencies enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.payment_country_config enable row level security;
alter table public.exchange_rates enable row level security;

-- Insert-only for staff (no update/delete policy) — enforces the
-- append-only invariant at the database level, not just by
-- convention: a "correction" to a past rate is a new row with a new
-- effective_from, never an edit to history.
create policy "exchange_rates: readable by authenticated" on public.exchange_rates
  for select to authenticated using (true);
create policy "exchange_rates: staff insert" on public.exchange_rates
  for insert to authenticated
  with check ((select private.is_staff_or_admin()));

create policy "currencies: readable by authenticated" on public.currencies
  for select to authenticated using (true);
create policy "currencies: staff manage" on public.currencies
  for all to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

create policy "bank_accounts: readable by authenticated" on public.bank_accounts
  for select to authenticated using (is_active);
create policy "bank_accounts: staff manage" on public.bank_accounts
  for all to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

create policy "payment_country_config: readable by authenticated" on public.payment_country_config
  for select to authenticated using (is_active);
create policy "payment_country_config: staff manage" on public.payment_country_config
  for all to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

grant select on public.currencies, public.bank_accounts, public.payment_country_config, public.exchange_rates, public.current_exchange_rates to authenticated;
grant insert, update, delete on public.currencies, public.bank_accounts, public.payment_country_config to authenticated;
grant insert on public.exchange_rates to authenticated; -- insert-only, see the RLS policy comment above

-- ============================================================
-- RLS — payments. Clients read only their own rows; staff/admin
-- read and manage everything. All writes happen server-side
-- (webhook handlers, admin approve/reject actions) via the
-- service-role client, matching how every other write-heavy table
-- in this schema (enquiries, workshop_registrations) is handled —
-- authenticated-role INSERT/UPDATE is deliberately not granted here.
-- ============================================================
alter table public.payments enable row level security;

create policy "payments: own read" on public.payments
  for select to authenticated
  using (user_id = auth.uid());

create policy "payments: staff read all" on public.payments
  for select to authenticated
  using ((select private.is_staff_or_admin()));

create policy "payments: staff manage" on public.payments
  for all to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

grant select on public.payments to authenticated;
grant select, insert, update on public.payments to service_role;

-- ============================================================
-- RLS — payment_webhook_events. Staff/admin only (this is an
-- internal reconciliation/audit log, not client-facing); all writes
-- server-side via service_role, same as payments itself.
-- ============================================================
alter table public.payment_webhook_events enable row level security;

create policy "payment_webhook_events: staff read" on public.payment_webhook_events
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.payment_webhook_events to authenticated;
grant select, insert, update on public.payment_webhook_events to service_role;

-- ============================================================
-- Storage — private bucket for proof-of-payment uploads
-- (bank-transfer workflow). First Supabase Storage bucket in this
-- project (Portfolio media is Sanity-hosted, not Supabase Storage).
-- Private (public = false): access is exclusively via short-lived
-- signed URLs generated server-side after an authorization check,
-- never a public/listable path — PAYMENT_SECURITY_REVIEW.md §13/§14.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  8388608, -- 8MB, matching the existing portfolio-upload ceiling (src/app/api/admin/portfolio/assets/route.ts)
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

-- Object path convention: {payment_id}/{filename} — lets the RLS
-- policies below check ownership via a path segment without a join,
-- the same technique Supabase's own Storage RLS examples use.
create policy "payment-proofs: owner or staff upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (
      (select private.is_staff_or_admin())
      or exists (
        select 1 from public.payments
        where payments.id::text = (storage.foldername(name))[1]
        and payments.user_id = auth.uid()
      )
    )
  );

create policy "payment-proofs: owner or staff read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (select private.is_staff_or_admin())
      or exists (
        select 1 from public.payments
        where payments.id::text = (storage.foldername(name))[1]
        and payments.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Reserved for Future Accounting Ledger — documentation only, no
-- tables created here. Per your explicit instruction: not building
-- double-entry bookkeeping now, just confirming the attachment point
-- exists so it doesn't require restructuring this migration's tables
-- later.
--
-- The eventual shape (not built): a `chart_of_accounts` table (asset/
-- liability/equity/revenue/expense accounts, optionally hierarchical
-- via a parent_account_id) and a `ledger_entries` table (double-entry
-- journal lines: debit_account_id, credit_account_id, amount,
-- currency, source_type, source_id, posted_at).
--
-- The attachment mechanism: `ledger_entries.source_type`/`source_id`
-- would be a THIRD instance of the same polymorphic-reference pattern
-- already used twice in this file (entity_type/entity_id on payments;
-- related_type/related_id on payments) — pointing at whichever
-- financial-event row produced the entry: a payments row, a future
-- expenses row, a future payouts row, a future invoices row. None of
-- those source tables need to know the ledger exists; the ledger
-- references them, not the reverse.
--
-- Why payments needs nothing further for this: `posted_at` (above)
-- already gives a future ledger-posting job an obvious "not yet
-- journaled" marker to query (`where posted_at is null`) without a
-- join. `reference_amount_usd`, `converted_amount`, `settlement_
-- currency`, `gateway_fee`, and `net_amount_received` already carry
-- enough granularity to post a correct multi-currency journal entry
-- (gross revenue, FX gain/loss, processing-fee expense) without
-- deriving anything payments doesn't already store.
--
-- Trigger to actually build this: when a real bookkeeping/accounting
-- feature is scoped, not before — same "do now" vs. "seam only" test
-- as everything else in this project's architecture decisions.
-- ============================================================

commit;
