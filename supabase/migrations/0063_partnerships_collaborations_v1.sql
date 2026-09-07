-- Ordift Partnerships & Collaborations V1 (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - Confirmed 0062 is the latest applied migration (local=remote=0062,
--     Production Operations Admin consolidation) before writing this
--     file — this migration is 0063.
--   - This is DELIBERATELY NOT "Pricing Family #9". No pricing rate
--     table is created here, and pricing_service_categories is
--     untouched. Partnerships is a commercial qualification/value-
--     assessment/governance/agreement layer that REFERENCES the
--     existing pricing engines to establish Normal Commercial Value —
--     it never duplicates a pricing formula.
--   - payee_profiles (0049) was inspected: its id is a hard FK to
--     profiles.id, so it cannot represent an external partner/referrer
--     who has no Ordift account. Partnership counterparts are
--     therefore free-text fields on partnership_opportunities
--     (counterpart_name/organisation/contact) — a genuine payee
--     record, when one is eventually needed for actual payment, is
--     created separately through the existing Payables flow and simply
--     referenced (see partnership_referral_commission_events' approval
--     fields), never duplicated or auto-created here.
--   - project_requests (0008) was inspected as a candidate reuse target
--     but is a narrower, specific mechanism (client-initiated requests
--     against an enquiry/workshop_registration via a request_types
--     lookup). Its LOOKUP-TABLE pattern (request_types) is reused
--     directly for partnership_types below — same shape, same RLS
--     policy — rather than a hard-coded check constraint, so future
--     partnership types genuinely need no schema redesign.
--   - enquiries (0001) was inspected: partnership_opportunities and
--     partnership_referral_leads both use the SAME polymorphic
--     reference_type/reference_id pattern already established twice
--     (discount_redemptions.reference_type/reference_id;
--     payment_obligations.source_type/source_reference) to optionally
--     anchor to a real enquiry — never a hard FK, since a partnership
--     opportunity can exist before any enquiry does.
--   - commercialEstimate.ts's usage/territory vocabulary (0057) is
--     reused (TYPE-ONLY import in rightsGovernance.ts, zero runtime
--     coupling) rather than re-invented — no second, contradictory
--     licensing taxonomy.
--   - No signature/e-signature or Legal Suite table exists anywhere in
--     this schema (confirmed by search) — partnership_agreements
--     therefore carries only a free-text signature_reference/
--     acceptance_method pointing at wherever a real signature is
--     recorded (e.g. an external e-sign reference or an uploaded
--     signed document reference), and acceptance_recorded_at is never
--     auto-set — no fabricated legal language, no fake acceptance.
--   - Minimum coherent schema — NINE tables, deliberately not "one per
--     noun in the spec": rights/exclusivity/deliverables/direct-cost-
--     responsibility all live inside partnership_agreements.
--     terms_snapshot (jsonb) rather than becoming their own tables,
--     since they are inherently part of ONE agreement version's terms
--     and never need independent querying beyond that agreement.
--     Each of the nine tables below corresponds to a genuinely distinct
--     governed/versioned/audited concern the approved spec explicitly
--     requires to survive independently:
--       * partnership_types — extensible classification lookup.
--       * partnership_opportunities — the case/relationship anchor and
--         lifecycle-stage state machine.
--       * partnership_value_assessments — APPEND-ONLY NCV/PCV/RCV/CASH
--         snapshots (never UPDATEd — a new assessment is always a new
--         row, satisfying "approved RCV/concession must not be
--         silently rewritten").
--       * partnership_strategic_assessments — APPEND-ONLY 100-point
--         strategic score snapshots, informational only (no approval
--         field anywhere in this table).
--       * partnership_agreements — APPEND-ONLY agreement/amendment
--         version chain (supersedes_id), carrying the full terms
--         snapshot as jsonb.
--       * partnership_referrals — APPEND-ONLY referral commission-term
--         version chain (rate/duration/attribution changes are new
--         rows, never in-place edits).
--       * partnership_referral_leads — the actual introduced prospects
--         being tracked for attribution/anti-gaming, one row per
--         introduction.
--       * partnership_referral_commission_events — the EARNED
--         commission calculation record, tied to a real collected-
--         revenue reference; never itself a payable/payment (see the
--         table comment below).
--       * partnership_outcome_reviews — post-completion review,
--         distinguishing promised vs actually-received partner value.
--   - RLS: every table below is staff-read-only via
--     private.is_staff_or_admin() (partnership_types is "read all
--     authenticated", same as request_types, since it carries no
--     sensitive value data) — NO public/anon policy anywhere. Internal
--     notes, RCV, concession, strategic score, and risk deductions are
--     never publicly readable.
--   - Authorization: STRATEGY_CAPABILITIES (src/lib/organization/
--     authority.ts) gained partnership-specific capabilities in this
--     same phase — no new capability GROUP, no duplicate permission
--     system. See that file's own doc comment for the exact mapping
--     (lower three concession bands get a capability each; the upper
--     two bands are Super-Admin-only with no capability at all).
--   - discount_codes/discount_redemptions/payment_obligations/
--     production_suppliers/production_supplier_quotes/
--     production_budgets: completely untouched by this migration.
--     WLCMBCK is not referenced anywhere in this file.
--
-- 0001-0062 are not modified. Every statement below is additive (new
-- tables only). No destructive statement appears anywhere in this file.

begin;

-- ============================================================
-- PART A — partnership_types (extensible lookup, reusing request_types' shape)
-- ============================================================
create table public.partnership_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  key text not null,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);

comment on table public.partnership_types is
  'Extensible partnership/collaboration classifications — these are classifications, never pricing families. New types are added by inserting a row, never a schema change.';

alter table public.partnership_types enable row level security;

create policy "partnership_types: read all authenticated" on public.partnership_types
  for select
  to authenticated
  using (true);

grant select on public.partnership_types to authenticated;
grant select, insert, update, delete on public.partnership_types to service_role;

insert into public.partnership_types (key, label, sort_order) values
  ('strategic_partnership', 'Strategic Partnership', 1),
  ('brand_collaboration', 'Brand Collaboration', 2),
  ('value_exchange_barter', 'Value Exchange / Barter', 3),
  ('creator_talent_collaboration', 'Creator / Talent Collaboration', 4),
  ('venue_hospitality_partnership', 'Venue / Hospitality Partnership', 5),
  ('referral_partnership', 'Referral Partnership', 6),
  ('co_production', 'Co-Production', 7),
  ('sponsorship', 'Sponsorship', 8),
  ('portfolio_creative_collaboration', 'Portfolio / Creative Collaboration', 9),
  ('custom_strategic_arrangement', 'Custom Strategic Arrangement', 10);

-- ============================================================
-- PART B — partnership_opportunities (the case/relationship anchor)
-- ============================================================
create table public.partnership_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  partnership_type_id uuid not null references public.partnership_types (id),
  status text not null default 'opportunity' check (status in (
    'opportunity', 'qualification', 'value_assessment', 'proposed_terms', 'internal_review', 'decision', 'agreement', 'signatures', 'active', 'deliverables', 'completion', 'outcome_review'
  )),
  decision_outcome text check (decision_outcome in ('commercially_acceptable', 'strategic_exception', 'convert_to_paid_proposal', 'declined')),
  counterpart_name text not null,
  counterpart_organisation text,
  counterpart_contact_email text,
  counterpart_contact_phone text,
  market_id uuid references public.pricing_markets (id),
  -- Polymorphic, optional anchor to the enquiry this opportunity came
  -- through (if any) — never a hard FK, since an opportunity can be
  -- created directly in Admin with no public enquiry at all.
  reference_type text,
  reference_id text,
  summary text,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.partnership_opportunities is
  'The partnership/collaboration case and its lifecycle stage. decision_outcome is only ever set from the "decision" stage onward and never fabricates external acceptance — see partnership_agreements for the governed acceptance/agreement stage that follows a decision.';

create index partnership_opportunities_status_idx on public.partnership_opportunities (status);
create index partnership_opportunities_reference_idx on public.partnership_opportunities (reference_type, reference_id);

alter table public.partnership_opportunities enable row level security;

create policy "partnership_opportunities: staff read" on public.partnership_opportunities
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_opportunities to authenticated;
grant select, insert, update, delete on public.partnership_opportunities to service_role;

-- ============================================================
-- PART C — partnership_value_assessments (APPEND-ONLY NCV/PCV/RCV/CASH)
-- ============================================================
create table public.partnership_value_assessments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.partnership_opportunities (id),
  ncv_amount numeric(12, 2) not null check (ncv_amount >= 0),
  ncv_currency text not null default 'USD' references public.currencies (code),
  ncv_basis text, -- e.g. 'photography_personal_rate', 'graphic_design_rate', 'admin_entered'
  ncv_explanation text,
  ncv_source_reference text, -- which existing pricing engine/estimate this traces to, where applicable
  pcv_amount numeric(12, 2) check (pcv_amount >= 0),
  pcv_currency text references public.currencies (code),
  pcv_description text,
  rcv_amount numeric(12, 2) not null default 0 check (rcv_amount >= 0),
  rcv_currency text not null default 'USD' references public.currencies (code),
  rcv_value_class text not null default 'class_c_speculative' check (rcv_value_class in ('class_a_hard_replacement', 'class_b_measurable_commercial', 'class_c_speculative')),
  rcv_valuation_method text,
  rcv_reason text,
  rcv_evidence_reference text,
  cash_consideration_amount numeric(12, 2) not null default 0 check (cash_consideration_amount >= 0),
  cash_consideration_currency text not null default 'USD' references public.currencies (code),
  net_ordift_contribution_usd numeric(12, 2) not null,
  effective_concession_percentage numeric(6, 2),
  partner_positive_value_usd numeric(12, 2),
  concession_band text check (concession_band in ('commercial_partnership', 'preferred_collaboration', 'strategic_collaboration', 'major_strategic_contribution', 'exceptional_sponsored_work', 'fully_sponsored_pro_bono')),
  direct_cost_responsibility jsonb not null default '[]'::jsonb,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  supersedes_id uuid references public.partnership_value_assessments (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_value_assessments is
  'APPEND-ONLY. A new assessment is always a new row (supersedes_id chains to the one it replaces) — approved NCV/RCV/concession are never rewritten in place, per the approved spec''s versioning requirement. net_ordift_contribution_usd/effective_concession_percentage/partner_positive_value_usd/concession_band are computed by assessValueEconomics() (src/lib/partnerships/valueEconomics.ts) at write time and stored for query convenience, immutable once written. direct_cost_responsibility is a small jsonb array ({category, fundedBy, amountUsd, notes}) rather than a separate relational table — it is inherently part of one assessment version''s terms.';

create index partnership_value_assessments_opportunity_idx on public.partnership_value_assessments (opportunity_id, created_at desc);

alter table public.partnership_value_assessments enable row level security;

create policy "partnership_value_assessments: staff read" on public.partnership_value_assessments
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_value_assessments to authenticated;
grant select, insert, update, delete on public.partnership_value_assessments to service_role;

-- ============================================================
-- PART D — partnership_strategic_assessments (APPEND-ONLY strategic score)
-- ============================================================
create table public.partnership_strategic_assessments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.partnership_opportunities (id),
  target_client_alignment int not null default 0 check (target_client_alignment between 0 and 20),
  brand_reputation_alignment int not null default 0 check (brand_reputation_alignment between 0 and 15),
  portfolio_creative_value int not null default 0 check (portfolio_creative_value between 0 and 15),
  measurable_distribution int not null default 0 check (measurable_distribution between 0 and 15),
  revenue_lead_potential int not null default 0 check (revenue_lead_potential between 0 and 15),
  market_entry_relationship_value int not null default 0 check (market_entry_relationship_value between 0 and 10),
  long_term_strategic_value int not null default 0 check (long_term_strategic_value between 0 and 10),
  broad_exclusivity int not null default 0 check (broad_exclusivity between 0 and 20),
  unclear_usage_ip int not null default 0 check (unclear_usage_ip between 0 and 20),
  high_unreimbursed_direct_cost int not null default 0 check (high_unreimbursed_direct_cost between 0 and 20),
  reputation_brand_risk int not null default 0 check (reputation_brand_risk between 0 and 25),
  unrealistic_deliverables_timeline int not null default 0 check (unrealistic_deliverables_timeline between 0 and 15),
  poor_counterparty_history int not null default 0 check (poor_counterparty_history between 0 and 20),
  base_score int not null,
  risk_deduction_total int not null,
  final_score int not null,
  interpretation text not null check (interpretation in ('strong_strategic_case', 'reasonable_case_review_economics', 'weak_convert_toward_paid', 'normally_decline')),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_strategic_assessments is
  'APPEND-ONLY, informational only — this table has NO approval_status/approved_by column at all, by design: the strategic score never authorizes anything (see computeStrategicScore()''s doc comment). base_score/risk_deduction_total/final_score/interpretation are computed at write time and stored for query convenience.';

create index partnership_strategic_assessments_opportunity_idx on public.partnership_strategic_assessments (opportunity_id, created_at desc);

alter table public.partnership_strategic_assessments enable row level security;

create policy "partnership_strategic_assessments: staff read" on public.partnership_strategic_assessments
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_strategic_assessments to authenticated;
grant select, insert, update, delete on public.partnership_strategic_assessments to service_role;

-- ============================================================
-- PART E — partnership_agreements (APPEND-ONLY agreement/amendment chain)
-- ============================================================
create table public.partnership_agreements (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.partnership_opportunities (id),
  value_assessment_id uuid references public.partnership_value_assessments (id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'active', 'amended', 'terminated')),
  -- Structured terms: parties, scope, deliverables, direct_cost_responsibility,
  -- rights (organicSocial/brandOwnedSocial/website/email/pr/paidSocial/
  -- whitelisting/print/ooh/broadcast/thirdPartySublicensing/
  -- editingAdaptation/territory/startDate/endDate — matches
  -- PartnershipUsageRights in rightsGovernance.ts exactly), ip_notes,
  -- exclusivity {category, territory, startDate, endDate, scope},
  -- revisions_approvals, timeline, cancellation_terms, credits,
  -- confidentiality, referral_terms, approval_authority. Kept as jsonb
  -- rather than 20 additional columns/tables — inherently one
  -- agreement version's terms, never independently queried.
  terms_snapshot jsonb not null default '{}'::jsonb,
  acceptance_recorded_at timestamptz,
  acceptance_method text,
  signature_reference text,
  supersedes_id uuid references public.partnership_agreements (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_agreements is
  'APPEND-ONLY. An amendment is always a new row (supersedes_id chains to the prior version) — never an in-place edit of an active agreement''s terms. acceptance_recorded_at/acceptance_method/signature_reference are never auto-set — client/partner acceptance is never fabricated. No legal template language is generated here; signature_reference points at wherever a real signature/acceptance is recorded (external e-sign reference, uploaded signed document reference) — this is a structured-data/template hook, not a legal document generator.';

create index partnership_agreements_opportunity_idx on public.partnership_agreements (opportunity_id, created_at desc);

alter table public.partnership_agreements enable row level security;

create policy "partnership_agreements: staff read" on public.partnership_agreements
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_agreements to authenticated;
grant select, insert, update, delete on public.partnership_agreements to service_role;

-- ============================================================
-- PART F — partnership_referrals (APPEND-ONLY commission-term chain)
-- ============================================================
create table public.partnership_referrals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.partnership_opportunities (id),
  commission_percentage numeric(5, 2) not null default 10.00 check (commission_percentage > 0),
  duration_preset text not null default 'first_engagement' check (duration_preset in ('first_engagement', 'six_months', 'twelve_months', 'custom')),
  custom_duration_months int,
  attribution_window_days int not null default 90,
  reason_for_elevated_rate text,
  requires_founder_approval boolean not null default false,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  supersedes_id uuid references public.partnership_referrals (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_referrals is
  'APPEND-ONLY referral commission terms for a referral_partnership opportunity — a rate/duration/attribution change is always a new row. Standard default is 10%; 15%+ requires reason_for_elevated_rate; above 20% or a custom duration beyond 12 months forces requires_founder_approval = true (computed via referralMath.ts at write time).';

create index partnership_referrals_opportunity_idx on public.partnership_referrals (opportunity_id, created_at desc);

alter table public.partnership_referrals enable row level security;

create policy "partnership_referrals: staff read" on public.partnership_referrals
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_referrals to authenticated;
grant select, insert, update, delete on public.partnership_referrals to service_role;

-- ============================================================
-- PART G — partnership_referral_leads (introduced prospects, anti-gaming tracking)
-- ============================================================
create table public.partnership_referral_leads (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.partnership_referrals (id),
  prospect_name text not null,
  prospect_email text,
  prospect_reference text,
  introduced_at timestamptz not null default now(),
  reference_type text,
  reference_id text,
  eligibility_status text not null default 'under_review' check (eligibility_status in ('eligible', 'ineligible', 'under_review')),
  ineligibility_reasons jsonb not null default '[]'::jsonb,
  related_party_disclosed boolean not null default false,
  attribution_expires_at timestamptz,
  status text not null default 'attributed' check (status in ('attributed', 'expired', 'converted', 'disputed')),
  dispute_notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_referral_leads is
  'One row per introduced prospect. eligibility_status/ineligibility_reasons are computed via assessReferralEligibility() (referralEligibility.ts) at write time. attribution_expires_at = introduced_at + the referral''s attribution_window_days, computed once at creation — original attribution is never silently overwritten; a dispute is recorded via status=disputed + dispute_notes, not by mutating introduced_at/reference_id.';

create index partnership_referral_leads_referral_idx on public.partnership_referral_leads (referral_id);

alter table public.partnership_referral_leads enable row level security;

create policy "partnership_referral_leads: staff read" on public.partnership_referral_leads
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_referral_leads to authenticated;
grant select, insert, update, delete on public.partnership_referral_leads to service_role;

-- ============================================================
-- PART H — partnership_referral_commission_events (earned commission, never a payable)
-- ============================================================
create table public.partnership_referral_commission_events (
  id uuid primary key default gen_random_uuid(),
  referral_lead_id uuid not null references public.partnership_referral_leads (id),
  gross_collected_amount numeric(12, 2) not null check (gross_collected_amount >= 0),
  excluded_amount numeric(12, 2) not null default 0 check (excluded_amount >= 0),
  eligible_collected_revenue numeric(12, 2) not null check (eligible_collected_revenue >= 0),
  commission_percentage numeric(5, 2) not null,
  commission_earned_amount numeric(12, 2) not null check (commission_earned_amount >= 0),
  currency text not null default 'USD' references public.currencies (code),
  collected_reference_type text,
  collected_reference_id text,
  status text not null default 'calculated' check (status in ('calculated', 'earned', 'approved_for_payment', 'paid')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_referral_commission_events is
  'A commission calculation tied to a specific real collected-revenue reference — computed via computeEligibleCollectedRevenue()/computeReferralCommissionEarned() (referralMath.ts). This table NEVER creates a payment_obligation, payable, or Paystack transfer — status progressing to "approved_for_payment" or even "paid" here is a descriptive record only; an actual payable/payout remains a separate, deliberate, explicitly-authorized action outside this table''s scope in V1 (reuse the existing Payables architecture when that step is genuinely authorized).';

create index partnership_referral_commission_events_lead_idx on public.partnership_referral_commission_events (referral_lead_id);

alter table public.partnership_referral_commission_events enable row level security;

create policy "partnership_referral_commission_events: staff read" on public.partnership_referral_commission_events
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_referral_commission_events to authenticated;
grant select, insert, update, delete on public.partnership_referral_commission_events to service_role;

-- ============================================================
-- PART I — partnership_outcome_reviews (promised vs realised)
-- ============================================================
create table public.partnership_outcome_reviews (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.partnership_opportunities (id),
  original_ncv_amount numeric(12, 2),
  approved_rcv_amount numeric(12, 2),
  cash_consideration_amount numeric(12, 2),
  actual_ordift_direct_cost numeric(12, 2),
  partner_contribution_promised jsonb not null default '[]'::jsonb,
  partner_contribution_actually_received jsonb not null default '[]'::jsonb,
  cash_actually_received_amount numeric(12, 2),
  leads_generated_count int,
  attributable_bookings_count int,
  attributable_revenue_amount numeric(12, 2),
  reach_distribution_result text,
  portfolio_value_outcome text,
  relationship_outcome text,
  notes text,
  would_collaborate_again text check (would_collaborate_again in ('yes', 'conditional', 'no')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.partnership_outcome_reviews is
  'Post-completion review, distinguishing PROMISED partner value (partner_contribution_promised) from ACTUALLY RECEIVED value (partner_contribution_actually_received) — never retroactively rewrites the original approved partnership_value_assessments row; this is a separate, additional record.';

create index partnership_outcome_reviews_opportunity_idx on public.partnership_outcome_reviews (opportunity_id, created_at desc);

alter table public.partnership_outcome_reviews enable row level security;

create policy "partnership_outcome_reviews: staff read" on public.partnership_outcome_reviews
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.partnership_outcome_reviews to authenticated;
grant select, insert, update, delete on public.partnership_outcome_reviews to service_role;

commit;
