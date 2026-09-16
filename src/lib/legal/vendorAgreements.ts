import { createAdminClient } from "@/lib/supabase/admin";
import { createDraftAgreement, addAgreementParty, attachAgreementSnapshot, createAgreementAmendment } from "./agreementEngine";
import { isTerminalAgreementStatus, isIssuedAgreementStatus, type AgreementLifecycleStatus } from "./agreementLifecycle";
import { checkVendorAgreementJurisdiction } from "./vendorAgreementJurisdictionGate";
import { VENDOR_FRAMEWORK_VARIABLES, type VendorFrameworkVariableKey } from "./documents/os-lgl-009a-vendor-supplier-framework-agreement";

// Ordift Studios Legal Suite — OS-LGL-009 Vendor & Supplier Framework
// Agreement architecture (2026-09-15). Approved integration: Option A
// (see the architecture report this module implements) — the
// A/B/C instrument family is represented WITHOUT any new
// legal_document_masters rows. OS-LGL-009 is reused exactly as already
// seeded (migration 0067) as the ONE master for all three:
//
//   OS-LGL-009A (Framework)      — one `agreements` row per vendor,
//                                  primary_context_type = 'vendor_profile'.
//   OS-LGL-009B (Work Order)     — its OWN `agreements` row (same
//                                  master_id as the Framework),
//                                  primary_context_type =
//                                  'vendor_framework_agreement', pointing
//                                  back at the Framework's own agreement
//                                  id — the exact polymorphic
//                                  primary_context pattern this schema
//                                  already documents as "reused, never
//                                  duplicated." Gives every Work Order
//                                  its own independent lifecycle/
//                                  execution, so it can genuinely
//                                  survive Framework termination.
//   OS-LGL-009C (Variation)      — an `agreement_amendments` row on the
//                                  relevant Work Order's agreement,
//                                  reusing createAgreementAmendment()
//                                  verbatim.
//
// This module is ONLY the draft-creation/domain layer — every function
// here creates or reads records, never composes/issues final signable
// text (that step needs OS_LGL_009_FULL_TEXT, which does not exist yet
// — see the architecture report). Nothing here can produce a fabricated
// execution: there is no "mark executed" path in this file at all: real
// execution only ever happens through signatureEngine.ts's
// recordSignatorySignature(), which requires genuine signature_evidence.

export const OS_LGL_009_CANONICAL_CODE = "OS-LGL-009";
export const VENDOR_FRAMEWORK_CONTEXT_TYPE = "vendor_profile";
export const VENDOR_WORK_ORDER_CONTEXT_TYPE = "vendor_framework_agreement";

type MasterRef = { id: string; currentVersionId: string };

async function getOsLgl009Master(admin: ReturnType<typeof createAdminClient>): Promise<MasterRef | null> {
  const { data } = await admin
    .from("legal_document_masters")
    .select("id, current_version_id")
    .eq("canonical_code", OS_LGL_009_CANONICAL_CODE)
    .maybeSingle();
  if (!data || !data.current_version_id) return null;
  return { id: data.id, currentVersionId: data.current_version_id };
}

export type VendorAgreementSummary = {
  id: string;
  agreementReference: string;
  status: AgreementLifecycleStatus;
  primaryContextType: string | null;
  primaryContextReference: string | null;
  createdAt: string;
};

function mapAgreementSummary(r: { id: string; agreement_reference: string; status: string; primary_context_type: string | null; primary_context_reference: string | null; created_at: string }): VendorAgreementSummary {
  return {
    id: r.id,
    agreementReference: r.agreement_reference,
    status: r.status as AgreementLifecycleStatus,
    primaryContextType: r.primary_context_type,
    primaryContextReference: r.primary_context_reference,
    createdAt: r.created_at,
  };
}

// The vendor's current (non-terminal) Framework agreement, if any — the
// single source of truth both createVendorFrameworkDraftAgreement()'s
// own duplicate guard and createVendorWorkOrderDraftAgreement()'s
// "Framework must already be issued" check read from.
export async function getCurrentVendorFrameworkAgreement(vendorProfileId: string): Promise<VendorAgreementSummary | null> {
  const admin = createAdminClient();
  const master = await getOsLgl009Master(admin);
  if (!master) return null;

  const { data } = await admin
    .from("agreements")
    .select("id, agreement_reference, status, primary_context_type, primary_context_reference, created_at")
    .eq("master_id", master.id)
    .eq("primary_context_type", VENDOR_FRAMEWORK_CONTEXT_TYPE)
    .eq("primary_context_reference", vendorProfileId)
    .order("created_at", { ascending: false });
  if (!data) return null;

  // Application-layer filter (not .not("status","in",...)) — small,
  // known row count per vendor, and keeps the terminal-status
  // definition in one place (isTerminalAgreementStatus()) rather than
  // duplicating the status list into a query filter.
  const current = data.map(mapAgreementSummary).find((a) => !isTerminalAgreementStatus(a.status));
  return current ?? null;
}

// OS-LGL-009A — Framework. Refuses if this vendor already has a
// current (non-terminal) Framework — a vendor has at most one active
// Framework relationship at a time, matching "the Framework continues
// until terminated" (a superseded/terminated one does not block a
// genuinely new one afterward). Refuses if the vendor's relationship
// jurisdiction isn't resolved/supported yet (checkVendorAgreementJurisdiction()).
// Resolves the Schedule A facts genuinely already known to the system
// — never guesses the rest. vendorLegalName/vendorTradingName/email/
// relationshipJurisdiction come from real, already-recorded data
// (profiles, vendor_profiles, auth.users, the jurisdiction gate);
// effectiveDate defaults to today only because it's the genuine date
// this draft is being created, not a guess about anything substantive.
//
// Vendor Profile Particulars (2026-09-15) — vendorType,
// registeredAddress, contactPerson, telephone, registrationNumber, and
// taxIdentifiers now ALSO have a genuine system source:
// vendor_profiles' own particulars columns (migration 0127), recorded
// once by an admin via the Company Profile form and reused by every
// Framework draft, rather than re-typed each time. Each is resolved
// here ONLY when genuinely present on the row — a vendor whose
// particulars are still incomplete simply leaves that key absent, and
// createVendorFrameworkDraftAgreement()'s own missing-fields check
// (below) refuses cleanly and names exactly what's still missing.
//
// ordiftContractingEntity is deliberately NOT resolved here — it is
// not a fact ABOUT the vendor, it is Ordift's own contracting party
// for this relationship, selected by the caller from the canonical
// employing_entities list (see the Framework form) and passed in via
// additionalVariables.
async function resolveKnownVendorFrameworkVariables(
  admin: ReturnType<typeof createAdminClient>,
  vendorProfileId: string,
  jurisdiction: string
): Promise<Partial<Record<VendorFrameworkVariableKey, string>>> {
  const [{ data: profile }, { data: vendorProfile }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", vendorProfileId).maybeSingle(),
    admin
      .from("vendor_profiles")
      .select("company_name, vendor_type, registered_address, contact_person, telephone, registration_number, tax_identifiers")
      .eq("id", vendorProfileId)
      .maybeSingle(),
    admin.auth.admin.getUserById(vendorProfileId),
  ]);
  const resolved: Partial<Record<VendorFrameworkVariableKey, string>> = {
    relationshipJurisdiction: jurisdiction,
    effectiveDate: new Date().toISOString().slice(0, 10),
  };
  if (profile?.full_name) resolved.vendorLegalName = profile.full_name;
  if (vendorProfile?.company_name) resolved.vendorTradingName = vendorProfile.company_name;
  if (vendorProfile?.vendor_type) resolved.vendorType = vendorProfile.vendor_type;
  if (vendorProfile?.registered_address) resolved.registeredAddress = vendorProfile.registered_address;
  if (vendorProfile?.contact_person) resolved.contactPerson = vendorProfile.contact_person;
  if (vendorProfile?.telephone) resolved.telephone = vendorProfile.telephone;
  if (vendorProfile?.registration_number) resolved.registrationNumber = vendorProfile.registration_number;
  if (vendorProfile?.tax_identifiers) resolved.taxIdentifiers = vendorProfile.tax_identifiers;
  const email = authUser?.user?.email;
  if (email) resolved.email = email;
  return resolved;
}

export type CreateVendorFrameworkDraftAgreementResult =
  | { ok: true; agreementId: string; agreementReference: string }
  | { ok: false; error: string; missingFields?: string[] };

// OS-LGL-009A — Framework. `additionalVariables` supplies the Schedule
// A facts that have no existing system source (see
// resolveKnownVendorFrameworkVariables()'s own comment) — merged with,
// never overriding, the genuinely-known values. Refuses (listing
// exactly which fields) if any VENDOR_FRAMEWORK_VARIABLES entry marked
// required is still missing after the merge — never creates a draft
// with an invented value standing in for a real one.
export async function createVendorFrameworkDraftAgreement(params: {
  vendorProfileId: string;
  additionalVariables?: Partial<Record<VendorFrameworkVariableKey, string>>;
  actorUserId: string;
}): Promise<CreateVendorFrameworkDraftAgreementResult> {
  const jurisdictionCheck = await checkVendorAgreementJurisdiction(params.vendorProfileId);
  if (!jurisdictionCheck.ok) return { ok: false, error: jurisdictionCheck.error };

  const admin = createAdminClient();
  const master = await getOsLgl009Master(admin);
  if (!master) return { ok: false, error: "OS-LGL-009 legal master is not available." };

  const existing = await getCurrentVendorFrameworkAgreement(params.vendorProfileId);
  if (existing) return { ok: false, error: `This vendor already has a current Framework Agreement (${existing.agreementReference}, status "${existing.status}").` };

  const known = await resolveKnownVendorFrameworkVariables(admin, params.vendorProfileId, jurisdictionCheck.jurisdiction);
  const variables: Partial<Record<VendorFrameworkVariableKey, string>> = { ...known, ...(params.additionalVariables ?? {}) };

  // agreementReference is a required VENDOR_FRAMEWORK_VARIABLES entry
  // in the FINAL snapshot, but it cannot exist before this point —
  // createDraftAgreement() below is what generates it
  // (generateNextAgreementReference(), a real Postgres sequence,
  // migration 0069), and it's only assigned into `variables` after the
  // draft row already exists. Excluded from this pre-creation
  // completeness check for that structural reason alone — it is set
  // unconditionally a few lines below and re-validated implicitly by
  // agreements' own `unique (business_id, agreement_reference)`
  // constraint (migration 0069), which makes a duplicate/missing
  // reference impossible regardless of this check.
  const missingFields = VENDOR_FRAMEWORK_VARIABLES.filter((v) => v.required && v.key !== "agreementReference" && !variables[v.key]).map((v) => v.label);
  if (missingFields.length > 0) {
    return { ok: false, error: "Required Framework particulars are not yet resolved — no draft was created.", missingFields };
  }

  const draft = await createDraftAgreement({
    masterId: master.id,
    masterVersionId: master.currentVersionId,
    classification: "transaction_agreement",
    engagementJurisdiction: jurisdictionCheck.jurisdiction,
    primaryContextType: VENDOR_FRAMEWORK_CONTEXT_TYPE,
    primaryContextReference: params.vendorProfileId,
    actorUserId: params.actorUserId,
  });
  if (!draft.ok) return draft;

  await addAgreementParty({
    agreementId: draft.agreementId,
    partyRole: "vendor",
    profileId: params.vendorProfileId,
    externalName: variables.vendorTradingName ?? variables.vendorLegalName ?? null,
    actorUserId: params.actorUserId,
  });
  await addAgreementParty({
    agreementId: draft.agreementId,
    partyRole: "ordift",
    profileId: params.actorUserId,
    actorUserId: params.actorUserId,
  });

  variables.agreementReference = draft.agreementReference;
  await attachAgreementSnapshot({
    agreementId: draft.agreementId,
    snapshotData: variables,
    sourceReference: `vendor_profile:${params.vendorProfileId}`,
    actorUserId: params.actorUserId,
  });

  return draft;
}

// OS-LGL-009B — Work Order. A subordinate commercial instrument under
// an already-issued Framework — refuses against a Framework that is
// still draft/internal_review (isIssuedAgreementStatus()) or that
// doesn't belong to this vendor. Uses the SAME master_id as the
// Framework (no separate legal_document_masters row — see this
// module's header) but its own agreement row, so it gets its own
// status lifecycle, own signature evidence, own ORD-AGR reference —
// multiple Work Orders may exist under one Framework, and each remains
// independently auditable even after the Framework is terminated.
// Work Order commercial/operational particulars (Part 3's field list) —
// stored as an agreement_snapshots row on the Work Order's own
// agreement, the exact same "frozen commercial/legal facts" mechanism
// every other agreement type already uses, never a new table. Purely
// a compile-time documentation/safety layer for callers — jsonb itself
// enforces no shape. Every field is optional: a Work Order may
// legitimately not need all of them (e.g. no personnel/crew for a
// goods-only supply), and none is ever fabricated to fill a gap.
export type VendorWorkOrderDetails = {
  projectTitle?: string;
  internalProjectReference?: string;
  clientReference?: string;
  serviceCategory?: string;
  scope?: string;
  deliverables?: string;
  quantities?: string;
  dates?: string;
  location?: string;
  callTimeSchedule?: string;
  milestones?: string;
  vendorPersonnel?: string;
  equipmentFacilityRequirements?: string;
  // Optional structured link to the specific vendor_rate_card_items row
  // this Work Order's cost is drawn from (vendorRateCards.ts) — the
  // "future quotation/job-costing integration point" this whole rate
  // card module exists for. Purely a reference id; vendorCost below
  // remains the actual agreed commercial figure recorded on THIS Work
  // Order (a rate card's own base_cost may change later without
  // silently altering an already-issued Work Order).
  rateCardItemId?: string;
  vendorCost?: string;
  currency?: string;
  taxWithholdingTreatment?: string;
  deposit?: string;
  paymentMilestones?: string;
  paymentDueBasis?: string;
  approvedExpenses?: string;
  overtimeRule?: string;
  cancellationRescheduling?: string;
  acceptanceCriteria?: string;
  ipTreatment?: string;
  publicityAuthorizationStatus?: string;
  confidentialityClassification?: string;
  personalDataProcessingIndicator?: string;
  dpaRequirement?: string;
  requiredLicencesInsurance?: string;
  safetySiteRequirements?: string;
  specialTerms?: string;
};

// Label ordering for Schedule B (the issued Work Order artifact,
// vendorWorkOrderIssuance.ts) — same "label + N/A for absent" rendering
// discipline as VENDOR_FRAMEWORK_VARIABLES' own Schedule A, but every
// field here is genuinely optional (no VendorWorkOrderDetails field is
// required — a goods-only supply may have no personnel/crew fields at
// all, and that's a real, valid Work Order, never an incomplete one).
export const VENDOR_WORK_ORDER_DETAIL_FIELDS: readonly { key: keyof VendorWorkOrderDetails; label: string }[] = [
  { key: "projectTitle", label: "Project Title" },
  { key: "internalProjectReference", label: "Internal Project Reference" },
  { key: "clientReference", label: "Client Reference" },
  { key: "serviceCategory", label: "Service Category" },
  { key: "scope", label: "Scope" },
  { key: "deliverables", label: "Deliverables" },
  { key: "quantities", label: "Quantities" },
  { key: "dates", label: "Dates" },
  { key: "location", label: "Location" },
  { key: "callTimeSchedule", label: "Call Time / Schedule" },
  { key: "milestones", label: "Milestones" },
  { key: "vendorPersonnel", label: "Vendor Personnel" },
  { key: "equipmentFacilityRequirements", label: "Equipment / Facility Requirements" },
  { key: "rateCardItemId", label: "Rate Card Reference" },
  { key: "vendorCost", label: "Vendor Cost" },
  { key: "currency", label: "Currency" },
  { key: "taxWithholdingTreatment", label: "Tax Withholding Treatment" },
  { key: "deposit", label: "Deposit" },
  { key: "paymentMilestones", label: "Payment Milestones" },
  { key: "paymentDueBasis", label: "Payment Due Basis" },
  { key: "approvedExpenses", label: "Approved Expenses" },
  { key: "overtimeRule", label: "Overtime Rule" },
  { key: "cancellationRescheduling", label: "Cancellation / Rescheduling" },
  { key: "acceptanceCriteria", label: "Acceptance Criteria" },
  { key: "ipTreatment", label: "IP Treatment" },
  { key: "publicityAuthorizationStatus", label: "Publicity Authorization Status" },
  { key: "confidentialityClassification", label: "Confidentiality Classification" },
  { key: "personalDataProcessingIndicator", label: "Personal Data Processing Indicator" },
  { key: "dpaRequirement", label: "DPA Requirement" },
  { key: "requiredLicencesInsurance", label: "Required Licences / Insurance" },
  { key: "safetySiteRequirements", label: "Safety / Site Requirements" },
  { key: "specialTerms", label: "Special Terms" },
];

export async function createVendorWorkOrderDraftAgreement(params: {
  frameworkAgreementId: string;
  vendorProfileId: string;
  details?: VendorWorkOrderDetails;
  actorUserId: string;
}): Promise<{ ok: true; agreementId: string; agreementReference: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: framework } = await admin
    .from("agreements")
    .select("id, master_id, master_version_id, status, jurisdiction, primary_context_type, primary_context_reference")
    .eq("id", params.frameworkAgreementId)
    .maybeSingle();
  if (!framework) return { ok: false, error: "Framework agreement not found." };
  if (framework.primary_context_type !== VENDOR_FRAMEWORK_CONTEXT_TYPE || framework.primary_context_reference !== params.vendorProfileId) {
    return { ok: false, error: "This Framework agreement does not belong to this vendor." };
  }
  if (!isIssuedAgreementStatus(framework.status as AgreementLifecycleStatus)) {
    return { ok: false, error: "A Work Order can only be created under a Framework Agreement that has already been issued." };
  }

  const { data: vendorProfile } = await admin.from("vendor_profiles").select("company_name").eq("id", params.vendorProfileId).maybeSingle();

  const draft = await createDraftAgreement({
    masterId: framework.master_id,
    masterVersionId: framework.master_version_id,
    classification: "transaction_agreement",
    engagementJurisdiction: framework.jurisdiction,
    primaryContextType: VENDOR_WORK_ORDER_CONTEXT_TYPE,
    primaryContextReference: params.frameworkAgreementId,
    actorUserId: params.actorUserId,
  });
  if (!draft.ok) return draft;

  await addAgreementParty({
    agreementId: draft.agreementId,
    partyRole: "vendor",
    profileId: params.vendorProfileId,
    externalName: vendorProfile?.company_name ?? null,
    actorUserId: params.actorUserId,
  });
  await addAgreementParty({
    agreementId: draft.agreementId,
    partyRole: "ordift",
    profileId: params.actorUserId,
    actorUserId: params.actorUserId,
  });

  if (params.details) {
    await attachAgreementSnapshot({
      agreementId: draft.agreementId,
      snapshotData: params.details,
      sourceReference: `vendor_framework_agreement:${params.frameworkAgreementId}`,
      actorUserId: params.actorUserId,
    });
  }

  return draft;
}

// OS-LGL-009C — Variation / Change Order. Thin wrapper around
// createAgreementAmendment() — the ONLY addition is confirming the
// target agreement is genuinely a Vendor Work Order (not an arbitrary
// agreement id) before delegating; createAgreementAmendment() itself
// already refuses against a not-yet-issued agreement and preserves the
// original terms untouched (append-only amendment history, never an
// overwrite).
// Variation / Change Order particulars (Part 4's field list) — stored
// in agreement_amendments.changes, reusing that column exactly as
// designed. Compile-time documentation only, same discipline as
// VendorWorkOrderDetails.
export type VendorWorkOrderVariationChanges = {
  originalTerm?: string;
  revisedTerm?: string;
  scopeImpact?: string;
  priceImpact?: string;
  scheduleImpact?: string;
  deliverableImpact?: string;
  taxPaymentImpact?: string;
  effectiveDate?: string;
};

export async function createVendorWorkOrderVariation(params: {
  workOrderAgreementId: string;
  reason: string;
  changes: VendorWorkOrderVariationChanges;
  actorUserId: string;
}): Promise<{ ok: true; amendmentId: string; amendmentNumber: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: workOrder } = await admin
    .from("agreements")
    .select("id, primary_context_type")
    .eq("id", params.workOrderAgreementId)
    .maybeSingle();
  if (!workOrder) return { ok: false, error: "Work Order not found." };
  if (workOrder.primary_context_type !== VENDOR_WORK_ORDER_CONTEXT_TYPE) {
    return { ok: false, error: "A Variation / Change Order can only be recorded against a genuine Vendor Work Order." };
  }

  return createAgreementAmendment({
    agreementId: params.workOrderAgreementId,
    reason: params.reason,
    changes: params.changes,
    actorUserId: params.actorUserId,
  });
}

// Evidence-only derive for the vendor_supplier_agreement_executed
// onboarding requirement (onboardingRequirements.ts) — mirrors
// deriveEmploymentAgreementExecuted()'s exact discipline: "satisfied"
// only once a REAL agreement genuinely reaches fully_executed/active/
// completed (real signature_evidence produced it, via
// signatureEngine.ts's recordSignatorySignature() — nothing in this
// module can reach those statuses on its own). Returns null (no
// opinion, falls back to pending/deferred) for every other case,
// including "no Framework exists yet" and "Framework exists but is
// still draft/sent/viewed" — never a manual "satisfied" standing in
// for an actual signature, the same rule employment_agreement_executed
// enforces for the employee pipeline.
export async function deriveVendorSupplierAgreementExecuted(vendorProfileId: string): Promise<"satisfied" | null> {
  const admin = createAdminClient();
  const master = await getOsLgl009Master(admin);
  if (!master) return null;

  const { data } = await admin
    .from("agreements")
    .select("status")
    .eq("master_id", master.id)
    .eq("primary_context_type", VENDOR_FRAMEWORK_CONTEXT_TYPE)
    .eq("primary_context_reference", vendorProfileId)
    .in("status", ["fully_executed", "active", "completed"])
    .limit(1)
    .maybeSingle();
  return data ? "satisfied" : null;
}

// Admin-visibility read — the Framework plus every Work Order under
// it, for a single vendor. Read-only; never used to infer anything
// about execution status beyond what's genuinely recorded.
export async function listVendorAgreementFamily(vendorProfileId: string): Promise<{ framework: VendorAgreementSummary | null; workOrders: VendorAgreementSummary[] }> {
  const admin = createAdminClient();
  const master = await getOsLgl009Master(admin);
  if (!master) return { framework: null, workOrders: [] };

  const { data: frameworkRows } = await admin
    .from("agreements")
    .select("id, agreement_reference, status, primary_context_type, primary_context_reference, created_at")
    .eq("master_id", master.id)
    .eq("primary_context_type", VENDOR_FRAMEWORK_CONTEXT_TYPE)
    .eq("primary_context_reference", vendorProfileId)
    .order("created_at", { ascending: false })
    .limit(1);
  const framework = frameworkRows?.[0] ? mapAgreementSummary(frameworkRows[0]) : null;

  if (!framework) return { framework: null, workOrders: [] };

  const { data: workOrderRows } = await admin
    .from("agreements")
    .select("id, agreement_reference, status, primary_context_type, primary_context_reference, created_at")
    .eq("master_id", master.id)
    .eq("primary_context_type", VENDOR_WORK_ORDER_CONTEXT_TYPE)
    .eq("primary_context_reference", framework.id)
    .order("created_at", { ascending: false });

  return { framework, workOrders: (workOrderRows ?? []).map(mapAgreementSummary) };
}
