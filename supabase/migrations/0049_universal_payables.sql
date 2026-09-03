-- Ordift Universal Payee/Payables System (2026-09-03)
--
-- Extends the Phase 3.3 payment_obligations/payment_instructions
-- foundation (0046) into a general Payee -> Engagement -> Payable ->
-- Payable Items -> Approval -> Payout -> Evidence -> Audit system,
-- capable of representing staff, vendors, contractors, freelancers,
-- instructors, talent, consultants, and any other external payee —
-- not a vendor-only or photo-editor-only feature.
--
-- INSPECTION SUMMARY (Phase 0 reconnaissance, this same date):
--   - payment_obligations/payment_instructions (0046): reused directly,
--     not duplicated. payment_obligations gains payable_items as a
--     child table (Part C below); its own columns, lifecycle, and RLS
--     are otherwise untouched.
--   - vendor_profiles/model_profiles (0001): confirmed still dormant
--     (zero write path, zero real usage beyond a read-only status
--     page) — not repurposed as the payee foundation, per explicit
--     instruction; a fresh, category-agnostic payee_profiles table is
--     used instead so the new system isn't built on a fragment.
--   - workshop_instructor_engagements (0047): left completely
--     untouched — its one real, working approval flow
--     (createInstructorEngagement -> linkEngagementToPaymentObligation
--     -> approvePaymentObligation) keeps functioning exactly as today.
--     The new, generalized `engagements` table below is a separate,
--     parallel path for every other payee category; both ultimately
--     converge on the same payment_obligations row, which is the
--     actual unification point — not a forced schema merge of two
--     already-working, differently-shaped tables.
--   - authority_grants/FINANCE_CAPABILITIES: reused as-is. No new
--     table. Three new capability strings are added in application
--     code only (src/lib/organization/authority.ts) — that is not a
--     schema change (authority_grants.authority has no CHECK/enum) and
--     is not part of this migration.
--   - staff compatibility: requires zero additional schema. A staff
--     member is simply a profiles row with a payee_profiles row whose
--     category = 'staff' — the same engagements/payment_obligations/
--     payable_items tables apply unchanged. No parallel staff finance
--     table is created.
--
-- Every table is purely additive. No existing table's columns, RLS
-- policies, CHECK constraints, or grants are altered by this
-- migration. No destructive statement (DROP/TRUNCATE/DELETE) appears
-- anywhere in this file. No amount/compensation data is seeded.

begin;

-- ============================================================
-- PART A — payee_profiles
-- ============================================================
-- Deliberately NOT vendor_profiles/model_profiles (see inspection
-- summary above) — a single, category-agnostic table for any profile
-- that can be paid: staff, vendor, contractor, freelancer, instructor,
-- talent, consultant, or other. `category` and `status` are
-- unconstrained text, matching this schema's established precedent
-- for extensible-without-a-migration classification fields
-- (activity_log.action, workflow_statuses.status, payment_obligations.
-- status) — documented allowed values below, not DB-enforced, so a
-- new payee category is a data fact, never a schema change.
-- operational_title_id reuses the existing lookup (0009) — already
-- seeded with photo_editor, retoucher, photographer, makeup_artist,
-- stylist, workshop_instructor, etc. — for the specific service
-- classification, kept separate from the broader category.
create table public.payee_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  category text not null,
  operational_title_id uuid references public.operational_titles (id),
  company_name text,
  status text not null default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.payee_profiles is
  'Any profile capable of participating as a payee. category (unconstrained text): staff | vendor | contractor | freelancer | instructor | talent | consultant | other. status: active | inactive | suspended. operational_title_id is the specific service classification (photo_editor, retoucher, workshop_instructor, ...), reusing the existing public.operational_titles lookup rather than duplicating it. This table never itself authorizes a payment — payment_obligations (0046) remains the sole payable record.';

alter table public.payee_profiles enable row level security;

create policy "payee_profiles: read own or staff" on public.payee_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_staff_or_admin()));

grant select on public.payee_profiles to authenticated;
grant select, insert, update, delete on public.payee_profiles to service_role;

create trigger payee_profiles_set_updated_at
  before update on public.payee_profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- PART B — engagements (generalized work relationship)
-- ============================================================
-- Modeled directly on workshop_instructor_engagements' proven shape
-- (payee identity as EITHER a real profile OR an external not-yet-
-- onboarded name; a linked payment_obligation once compensation is
-- agreed), generalized with the same entity_type/text-entity_id
-- polymorphic pattern already used by workflow_assignments (0023) —
-- so an engagement can optionally relate to any project/workshop/
-- enquiry, or none at all (e.g. a standalone consulting engagement).
-- engagement_type_id/operational_title_id reuse the existing lookups
-- (0009) rather than inventing new enums. Deliberately independent of
-- workshop_instructor_engagements (see inspection summary above) —
-- that table is not migrated into this one.
create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  payee_profile_id uuid references public.profiles (id),
  external_payee_name text,
  engagement_type_id uuid references public.engagement_types (id),
  operational_title_id uuid references public.operational_titles (id),
  role_note text,
  entity_type text,
  entity_id text,
  currency text,
  agreed_amount numeric(14, 2),
  starts_at date,
  ends_at date,
  due_date date,
  status text not null default 'draft',
  notes text,
  payment_obligation_id uuid references public.payment_obligations (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint engagements_payee_check check (payee_profile_id is not null or external_payee_name is not null)
);

comment on table public.engagements is
  'A general work relationship between Ordift and a payee (internal staff or external), independent of workshop_instructor_engagements (0047), which is left untouched. status (unconstrained text, matching payment_obligations'' own precedent): draft | engagement_active | work_submitted | work_approved | completed | cancelled | on_hold. entity_type/entity_id optionally link to a project/workshop/enquiry this engagement relates to — both nullable, for a standalone engagement with no such link. payment_obligation_id is set once agreed compensation becomes a real Payable (see createEngagementPayable() in src/lib/payables/engagements.ts) — creating it never itself moves money.';

create index engagements_payee_idx on public.engagements (payee_profile_id);
create index engagements_entity_idx on public.engagements (entity_type, entity_id) where entity_type is not null;
create index engagements_status_idx on public.engagements (status);

alter table public.engagements enable row level security;

create policy "engagements: read own or staff" on public.engagements
  for select
  to authenticated
  using ((select auth.uid()) = payee_profile_id or (select private.is_staff_or_admin()));

grant select on public.engagements to authenticated;
grant select, insert, update, delete on public.engagements to service_role;

create trigger engagements_set_updated_at
  before update on public.engagements
  for each row execute function public.set_updated_at();

-- ============================================================
-- PART C — payable_items (multi-line Payable components)
-- ============================================================
-- A payment_obligations row (0046) gains optional line items so one
-- Payable can represent multiple components (fee, reimbursement,
-- travel, per diem, ...) under a single engagement, without a second
-- obligations/payables table. `kind` is unconstrained text (same
-- precedent as category/status elsewhere in this file) — documented
-- values below. Deliberately insert-only in this phase (no update/
-- delete policy granted to any role below) — a correction is a new
-- item plus a note, not an edit to a historical line, mirroring
-- exchange_rates' (0024) same append-only discipline. This also keeps
-- the amount-sync trigger below simple and avoids the CHECK(amount >
-- 0) edge case an item deletion could otherwise create. Editing/
-- removing individual items, if ever needed, is a deliberately
-- deferred future extension — see the report accompanying this
-- migration.
create table public.payable_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  payment_obligation_id uuid not null references public.payment_obligations (id) on delete cascade,
  kind text not null,
  description text not null,
  currency text not null,
  amount numeric(14, 2) not null check (amount > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.payable_items is
  'One line item of a Payable (public.payment_obligations). kind (unconstrained text): fee | salary | bonus | allowance | reimbursement | travel | per_diem | accommodation | equipment | commission | other. currency should match the parent payment_obligations.currency — enforced in application code (src/lib/payables/payableItems.ts), not a DB constraint, since Postgres CHECK cannot reference another table. Insert-only by design in this phase (see table comment above) — the amount-sync trigger below only ever adds to the running total.';

create index payable_items_obligation_idx on public.payable_items (payment_obligation_id);

alter table public.payable_items enable row level security;

-- Same sensitivity tier as payment_obligations/payment_instructions
-- itself (0046's own "HIGHLY SENSITIVE" framing) — read own (via the
-- parent obligation's payee) or Super Admin, not the general staff/
-- admin tier.
create policy "payable_items: read own or super admin" on public.payable_items
  for select
  to authenticated
  using (
    (select private.is_super_admin())
    or exists (
      select 1 from public.payment_obligations po
      where po.id = payable_items.payment_obligation_id
        and po.payee_profile_id = (select auth.uid())
    )
  );

grant select on public.payable_items to authenticated;
grant select, insert on public.payable_items to service_role;

-- Keeps payment_obligations.amount deterministically derived from its
-- items the moment any item exists, while a Payable with zero items
-- (every existing row today, and every future single-amount Payable
-- created the same way payoutObligations.ts already does) keeps
-- working exactly as before — this trigger only ever fires on a
-- payable_items insert, never touches a payment_obligations row that
-- has no items. security definer + search_path='' since it writes to
-- a table the inserting role may not itself hold UPDATE on directly.
create or replace function private.sync_payment_obligation_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_obligations
  set amount = (
    select sum(amount) from public.payable_items where payment_obligation_id = new.payment_obligation_id
  )
  where id = new.payment_obligation_id;
  return new;
end;
$$;

revoke all on function private.sync_payment_obligation_amount() from public, anon, authenticated;
grant execute on function private.sync_payment_obligation_amount() to service_role;

create trigger payable_items_sync_obligation_amount
  after insert on public.payable_items
  for each row execute function private.sync_payment_obligation_amount();

-- ============================================================
-- PART D — payment_evidence (outbound counterpart to payments'
-- inbound proof_of_payment_asset_path / payment-proofs bucket, 0024)
-- ============================================================
create table public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  payment_obligation_id uuid not null references public.payment_obligations (id) on delete cascade,
  evidence_type text not null,
  storage_path text,
  reference text,
  notes text,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now()
);

comment on table public.payment_evidence is
  'Outbound payout proof for a Payable (public.payment_obligations) — the payout-side counterpart to payments.proof_of_payment_asset_path (0024, inbound). evidence_type (unconstrained text): receipt | bank_confirmation | momo_confirmation | other. storage_path is a private payout-evidence Storage object path (nullable — a reference-only record, e.g. a bank confirmation number with no file, is valid).';

create index payment_evidence_obligation_idx on public.payment_evidence (payment_obligation_id);

alter table public.payment_evidence enable row level security;

create policy "payment_evidence: read own or super admin" on public.payment_evidence
  for select
  to authenticated
  using (
    (select private.is_super_admin())
    or exists (
      select 1 from public.payment_obligations po
      where po.id = payment_evidence.payment_obligation_id
        and po.payee_profile_id = (select auth.uid())
    )
  );

grant select on public.payment_evidence to authenticated;
grant select, insert on public.payment_evidence to service_role;

-- ============================================================
-- Storage — private bucket for outbound payment evidence, mirroring
-- the payment-proofs bucket's (0024) exact shape and RLS technique
-- (object path convention: {payment_obligation_id}/{filename}).
-- Private (public = false): access exclusively via short-lived signed
-- URLs generated server-side after an authorization check.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payout-evidence',
  'payout-evidence',
  false,
  8388608, -- 8MB, matching payment-proofs (0024)
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

-- Insert: staff/admin only — recording payout evidence is an
-- operational task performed by Ordift about a payment it made, never
-- something the payee themselves uploads (contrast with payment-
-- proofs, where the paying client uploads their own proof).
create policy "payout-evidence: staff upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payout-evidence'
    and (select private.is_staff_or_admin())
  );

-- Read: staff/admin, or the payee whose payment_obligation this
-- evidence belongs to (transparency into their own payment record) —
-- same "own or staff" shape as payment_evidence's own table RLS above.
create policy "payout-evidence: owner or staff read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payout-evidence'
    and (
      (select private.is_staff_or_admin())
      or exists (
        select 1 from public.payment_obligations po
        where po.id::text = (storage.foldername(name))[1]
        and po.payee_profile_id = (select auth.uid())
      )
    )
  );

commit;
