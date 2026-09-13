-- Ordift Studios Compliance/COMP-SYS-1, Phase A2 (2026-09-13) —
-- REQUIREMENTS AUDIT/PERSISTENCE FOUNDATION.
--
-- Additive infrastructure only. No table is deleted/renamed, no
-- existing table is altered, no business data (evaluations,
-- resolutions, or acknowledgements) is inserted by this migration.
-- Nothing here is wired into OS-LGL-007, staff onboarding, Mishael
-- Adjei's record, Vendor/Model-Talent onboarding, or any live workflow
-- — that is explicitly deferred to a later, separately authorized
-- phase. This migration exists so a future evaluation, review
-- resolution, or policy acknowledgement has somewhere durable to be
-- recorded once real callers are authorized.
--
-- Column typing follows this repository's own established precedent:
-- classification-like values (relationship / jurisdiction / domain /
-- classification / resolution / acknowledgement_method) are
-- unconstrained `text`, application-validated against the TypeScript
-- unions in src/lib/compliance/requirementClassification.ts and
-- src/lib/compliance/requirementAudit.ts — the same precedent already
-- used for legal_document_masters.classification and
-- legal_document_versions.status (migration 0067) and
-- agreements.status (migration 0069). No DB CHECK/enum is introduced.
--
-- Immutability is enforced at the DATABASE level, not just by
-- convention: every table below grants service_role only `select,
-- insert` — the same "insert-only, no update, no delete" pattern
-- already proven for signature_events/signature_evidence (migration
-- 0070). A later event is always a NEW row, never an UPDATE of an
-- earlier one.

begin;

-- ============================================================
-- requirement_evaluations — immutable record of a single
-- classifyRequirement() call's outcome
-- ============================================================
-- subject_type/subject_reference is the same polymorphic pointer
-- pattern already proven for agreements.primary_context_type/
-- primary_context_reference (migration 0069) — e.g. subject_type
-- 'staff_onboarding', subject_reference the onboarding id.
--
-- outcome is the explicit provenance discriminator added at the
-- pre-migration checkpoint (mirrors ClassificationResult.outcome in
-- src/lib/compliance/requirementClassification.ts, Phase A2 extension):
-- matched_rule means a real RequirementRule governed this result (its
-- classification may itself be REVIEW_REQUIRED — an authored decision,
-- not a fail-closed gap). The other four values are always fail-closed
-- and always pair with classification = 'REVIEW_REQUIRED'.
--
-- rule_key/rule_version/rule_effective_from are a deliberate snapshot,
-- not a foreign key into any in-code catalogue — a future catalogue
-- change (or even removal of the rule) must never alter what this row
-- says was true at evaluation time. All three are populated together
-- ONLY when outcome = 'matched_rule' (enforced below, not just by
-- convention) — a fail-closed outcome genuinely has no single governing
-- rule to snapshot, and this table must never fabricate one to fill the
-- columns.
--
-- reason is the resolver's own human-readable explanation, persisted
-- verbatim (never re-derived later from a possibly-changed catalogue).
-- conflicting_rules is populated only for outcome = 'conflicting_rules'
-- — the exact competing rule identities/versions/classifications, as
-- structured JSON, so a conflict can be inspected without parsing
-- `reason`.
--
-- evaluated_by is nullable: a system-derived evaluation (run as part
-- of an automated pipeline, no human actor in the loop) legitimately
-- has no profile to attribute it to — same nullability precedent as
-- legal_document_masters.created_by / legal_document_versions.created_by.
create table public.requirement_evaluations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  subject_type text not null,
  subject_reference text not null,
  domain text not null,
  relationship text not null,
  jurisdiction text not null,
  classification text not null
    constraint requirement_evaluations_classification_check
    check (classification in ('REQUIRED', 'OPTIONAL', 'PROHIBITED', 'NOT_APPLICABLE', 'REVIEW_REQUIRED')),
  outcome text not null
    constraint requirement_evaluations_outcome_check
    check (outcome in ('matched_rule', 'unsupported_jurisdiction', 'malformed_jurisdiction', 'no_applicable_rule', 'conflicting_rules')),
  rule_key text,
  rule_version integer,
  rule_effective_from date,
  reason text not null,
  conflicting_rules jsonb,
  evaluated_at timestamptz not null default now(),
  evaluated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Every field of the rule snapshot is present together, or none is —
  -- never a partially-populated provenance row, and never present for
  -- anything other than a real matched_rule outcome.
  constraint requirement_evaluations_rule_provenance_consistency check (
    (outcome = 'matched_rule' and rule_key is not null and rule_version is not null and rule_effective_from is not null)
    or
    (outcome <> 'matched_rule' and rule_key is null and rule_version is null and rule_effective_from is null)
  ),
  -- A fail-closed outcome can never masquerade as a real classification
  -- decision — this is the structural backstop the checkpoint asked
  -- for, independent of whatever the application layer validates.
  constraint requirement_evaluations_fail_closed_review_required check (
    outcome = 'matched_rule' or classification = 'REVIEW_REQUIRED'
  ),
  -- conflicting_rules is populated if and only if outcome is
  -- 'conflicting_rules' — never left over from a different outcome,
  -- never absent when it is the one outcome that needs it.
  constraint requirement_evaluations_conflicting_rules_consistency check (
    (outcome = 'conflicting_rules') = (conflicting_rules is not null)
  )
);

comment on table public.requirement_evaluations is
  'Immutable, append-only record of one classifyRequirement() outcome (src/lib/compliance/requirementClassification.ts). classification: REQUIRED | OPTIONAL | PROHIBITED | NOT_APPLICABLE | REVIEW_REQUIRED (CHECK-constrained). outcome: matched_rule | unsupported_jurisdiction | malformed_jurisdiction | no_applicable_rule | conflicting_rules (CHECK-constrained) — the explicit provenance discriminator; only matched_rule carries a rule snapshot, and only matched_rule may have a classification other than REVIEW_REQUIRED (both enforced by CHECK constraints, not just application code). relationship: EMPLOYEE | CONTRACTOR | VENDOR | MODEL_TALENT. jurisdiction: GH | QA | GB | DE_EU | US | OTHER. domain is the requirement domain string the rule catalogue keys on (e.g. "identity_document_collection"). rule_key/rule_version/rule_effective_from are a frozen snapshot of the exact rule that produced this result and must never be re-derived from the current code catalogue, which may have since changed. reason is the resolver''s own human-readable explanation, persisted verbatim. conflicting_rules (jsonb, populated only for outcome=''conflicting_rules'') lists the competing rules'' {ruleKey, ruleVersion, classification}. Never UPDATEd or DELETEd once inserted (see grants below) — a re-evaluation is always a new row.';
comment on column public.requirement_evaluations.subject_reference is
  'Polymorphic pointer paired with subject_type — same established pattern as agreements.primary_context_type/primary_context_reference (migration 0069). Not a foreign key: the referenced subject type varies by caller.';

create index requirement_evaluations_subject_idx on public.requirement_evaluations (subject_type, subject_reference);
create index requirement_evaluations_rule_key_idx on public.requirement_evaluations (rule_key);
create index requirement_evaluations_evaluated_at_idx on public.requirement_evaluations (evaluated_at);

alter table public.requirement_evaluations enable row level security;

-- Admin-tier read only, same precedent as legal_document_masters/
-- agreements/signature_evidence — no "own read" policy yet since
-- subject_reference is not guaranteed to be a profile id (it is
-- whatever the calling module's subject actually is), and no live
-- caller exists yet to make that distinction meaningful.
create policy "requirement_evaluations: admin read" on public.requirement_evaluations
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.requirement_evaluations to authenticated;
-- Insert-only for service_role — no update/delete grant at all, making
-- "append-only/immutable" a real database-level guarantee, not just
-- convention (same pattern as signature_events/signature_evidence).
grant select, insert on public.requirement_evaluations to service_role;

-- ============================================================
-- requirement_review_resolutions — append-only governance decision
-- about a REVIEW_REQUIRED evaluation
-- ============================================================
-- Deliberately NEVER updates or repoints requirement_evaluations.
-- classification (what the resolver determined) and resolution (what
-- an authorized reviewer subsequently decided about progression) are
-- kept as two separate, separately-timestamped concepts by design —
-- collapsing them would make it impossible to tell, later, whether a
-- REQUIRED outcome was the resolver's own determination or a reviewer
-- override. Multiple resolution rows may reference the same
-- evaluation_id over time (e.g. an initial "escalated" followed later
-- by "approved_to_proceed") — each is a new row; none is ever edited.
create table public.requirement_review_resolutions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  evaluation_id uuid not null references public.requirement_evaluations (id),
  resolution text not null,
  resolved_by uuid not null references public.profiles (id),
  resolved_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.requirement_review_resolutions is
  'Append-only. resolution: approved_to_proceed | blocked | escalated (see REVIEW_RESOLUTION_OUTCOMES in src/lib/compliance/requirementAudit.ts). resolved_by is mandatory — a review resolution is always a specific accountable person''s decision, never anonymous or system-generated. Writing a row requires governance.compliance.track (or Super Admin override) at the application layer (src/lib/compliance/requirementAudit.ts) — RLS grants service_role only insert, so this is enforced before the database is ever touched, the same defense-in-depth pattern already used for governance.contract.administer in src/lib/legal/agreementEngine.ts.';

create index requirement_review_resolutions_evaluation_id_idx on public.requirement_review_resolutions (evaluation_id);
create index requirement_review_resolutions_resolved_at_idx on public.requirement_review_resolutions (resolved_at);

alter table public.requirement_review_resolutions enable row level security;

create policy "requirement_review_resolutions: admin read" on public.requirement_review_resolutions
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.requirement_review_resolutions to authenticated;
-- Insert-only for service_role — append-only at the database level.
-- The governance.compliance.track capability check happens in
-- application code (requireComplianceTrack() in requirementAudit.ts)
-- before this insert is ever issued; RLS itself does not (and cannot,
-- since service_role bypasses RLS) express that capability rule.
grant select, insert on public.requirement_review_resolutions to service_role;

-- ============================================================
-- policy_acknowledgements — durable evidence that a specific person
-- was presented with and acknowledged a specific controlled policy
-- version
-- ============================================================
-- References legal_document_versions directly (never a bare master) —
-- an acknowledgement is only meaningful against one exact version's
-- content. No policy text is duplicated here or anywhere in this
-- migration; the version row already carries content_reference
-- (migration 0067/0082). A new policy version never rewrites or
-- invalidates a historical acknowledgement of an older version — this
-- table has no update path at all (see grants below), and no
-- superseded_by-style column is introduced; whether a new version
-- requires re-acknowledgement is an explicit business rule for a later
-- phase, not decided here.
create table public.policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  policy_version_id uuid not null references public.legal_document_versions (id),
  profile_id uuid not null references public.profiles (id),
  relationship text not null,
  jurisdiction text not null,
  presented_at timestamptz not null,
  acknowledged_at timestamptz not null,
  acknowledgement_method text not null,
  evidence_reference text,
  created_at timestamptz not null default now()
);

comment on table public.policy_acknowledgements is
  'Append-only historical evidence that profile_id was presented with and acknowledged policy_version_id (a specific legal_document_versions row, never a bare master). No policy text is stored here — see legal_document_versions.content_reference for the governed content. relationship/jurisdiction record what applied to this person at acknowledgement time (same vocabulary as requirement_evaluations). acknowledgement_method/evidence_reference are free text pending a real acknowledgement UX (Phase B) — e.g. method "digital_click_through" with evidence_reference pointing at a signature_evidence row, or method "physical_signature" with evidence_reference pointing at a scanned document location. No self-service write path exists yet — every insert goes through service_role application code (src/lib/compliance/requirementAudit.ts), same "never a direct authenticated write" precedent as legal_document_masters/versions.';

create index policy_acknowledgements_policy_version_id_idx on public.policy_acknowledgements (policy_version_id);
create index policy_acknowledgements_profile_id_idx on public.policy_acknowledgements (profile_id);
create index policy_acknowledgements_acknowledged_at_idx on public.policy_acknowledgements (acknowledged_at);

alter table public.policy_acknowledgements enable row level security;

create policy "policy_acknowledgements: admin read" on public.policy_acknowledgements
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

-- A person may eventually need to see their own acknowledgement
-- history (e.g. "which policies have I acknowledged") — this is a safe
-- READ-ONLY primitive, same "own read" precedent as
-- signature_signatories (migration 0070). It grants no write path: a
-- person still cannot insert their own acknowledgement row (service_role
-- only, below) — full self-service acknowledgement is explicitly
-- deferred to a later phase.
create policy "policy_acknowledgements: own read" on public.policy_acknowledgements
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

grant select on public.policy_acknowledgements to authenticated;
-- Insert-only for service_role — append-only at the database level.
grant select, insert on public.policy_acknowledgements to service_role;

commit;
