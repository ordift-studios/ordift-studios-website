import { createAdminClient } from "@/lib/supabase/admin";
import { mapEmploymentJurisdictionToWorkforceJurisdiction } from "@/lib/compliance/workforceMappings";
import type { WorkforceJurisdiction } from "@/lib/compliance/requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B2 Step 1-2 (2026-09-14).
//
// OS-LGL-007 JURISDICTION-SCHEDULE EXISTENCE HARD GATE — employee-
// agreement-specific, not a generic Legal Suite restriction. This module
// is called by createEmployeeEmploymentAgreementDraft() only; it does
// not touch agreementEngine.ts, jurisdictionRouting.ts, or any other
// agreement type's issuance path.
//
// THE APPROVED OS-LGL-007 MASTER IS NOT ITSELF THE JURISDICTION-SPECIFIC
// SCHEDULE. Its own Clause 29 and Schedule C ("Jurisdiction Routing &
// Mandatory-Law Safeguards") explicitly require a separate,
// counsel-adapted, jurisdiction-specific schedule before real use. Nothing
// in this module infers schedule existence from OS-LGL-007's own
// content_reference, from Schedule C's wording, from employment_jurisdictions,
// or from whether src/lib/legal/jurisdictionRouting.ts happens to
// recognize a jurisdiction string — none of those are evidence that a
// real, approved schedule exists. Only a real legal_document_masters row
// with adapts_master_id pointing at OS-LGL-007 and an active version is
// evidence.
//
// Step 2 (migration 0084): the jurisdiction-schedule registry now exists
// — reused legal_document_masters/legal_document_versions rather than a
// new parallel table, via two added columns (adapts_master_id,
// applies_to_jurisdiction). findApprovedJurisdictionSchedule() below
// queries it directly. For Ghana specifically, OS-HR-GH-001 is now
// registered as an active version effective 2026-09-14 — every other
// jurisdiction remains unregistered and therefore still blocked.

export const OS_LGL_007_MASTER_CANONICAL_CODE = "OS-LGL-007";

export type EmployeeAgreementJurisdictionGateState =
  | "MISSING_JURISDICTION"
  | "UNRESOLVED_JURISDICTION"
  | "NO_APPROVED_JURISDICTION_SCHEDULE"
  | "APPROVED_SCHEDULE_AVAILABLE";

// Same {ok:true|false} shape used throughout this codebase's Legal Suite
// (createDraftAgreement, addAgreementParty, recordRequirementEvaluation,
// etc.) — not a parallel convention — with `state` added so a caller can
// distinguish the four gate outcomes without parsing `error` text.
// `error` is a safe, non-internal message only (no table/column names,
// no implementation detail) — suitable to surface to an admin UI.
export type EmployeeAgreementJurisdictionGateResult =
  | { ok: true; state: "APPROVED_SCHEDULE_AVAILABLE"; workforceJurisdiction: WorkforceJurisdiction }
  | {
      ok: false;
      state: Exclude<EmployeeAgreementJurisdictionGateState, "APPROVED_SCHEDULE_AVAILABLE">;
      error: string;
    };

// Real lookup (Phase B2 Step 2) — queries legal_document_masters for a
// row that (a) adapts the named master (adapts_master_id), (b) applies
// to this exact jurisdiction (applies_to_jurisdiction), and whose
// current_version_id is a version with status 'active' and an
// effective_date on or before today. Never infers "found" from any
// weaker signal (see module doc comment). A schedule dated in the
// future (effective_date > today) is correctly NOT found yet — it
// exists as a controlled record but is not yet in force.
async function findApprovedJurisdictionSchedule(
  masterCanonicalCode: string,
  jurisdiction: WorkforceJurisdiction
): Promise<{ found: false } | { found: true; scheduleId: string }> {
  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id").eq("canonical_code", masterCanonicalCode).maybeSingle();
  if (!master) return { found: false };

  const { data: schedule } = await admin
    .from("legal_document_masters")
    .select("id, current_version_id, legal_document_versions!legal_document_masters_current_version_fkey(status, effective_date)")
    .eq("adapts_master_id", master.id)
    .eq("applies_to_jurisdiction", jurisdiction)
    .maybeSingle();
  if (!schedule?.current_version_id) return { found: false };

  const version = schedule.legal_document_versions as unknown as { status: string; effective_date: string | null } | null;
  if (!version || version.status !== "active") return { found: false };
  if (!version.effective_date || version.effective_date > new Date().toISOString().slice(0, 10)) return { found: false };

  return { found: true, scheduleId: schedule.id };
}

// Pure decision logic apart from the lookup call above — the mapping
// step is entirely synchronous/pure (src/lib/compliance/workforceMappings.ts),
// so every non-APPROVED_SCHEDULE_AVAILABLE outcome here is testable
// without any I/O at all.
export async function checkEmployeeAgreementJurisdictionSchedule(
  rawJurisdiction: string | null | undefined
): Promise<EmployeeAgreementJurisdictionGateResult> {
  if (!rawJurisdiction || !rawJurisdiction.trim()) {
    return {
      ok: false,
      state: "MISSING_JURISDICTION",
      error: "Employment jurisdiction has not been resolved for this onboarding — an Employee Employment Agreement cannot be drafted yet.",
    };
  }

  const workforceJurisdiction = mapEmploymentJurisdictionToWorkforceJurisdiction(rawJurisdiction);
  if (!workforceJurisdiction) {
    return {
      ok: false,
      state: "UNRESOLVED_JURISDICTION",
      error: "This employment jurisdiction is not yet recognized by the compliance system — it requires review before an Employee Employment Agreement can be drafted.",
    };
  }

  const schedule = await findApprovedJurisdictionSchedule(OS_LGL_007_MASTER_CANONICAL_CODE, workforceJurisdiction);
  if (!schedule.found) {
    return {
      ok: false,
      state: "NO_APPROVED_JURISDICTION_SCHEDULE",
      error: `No approved jurisdiction-specific schedule exists yet for this employment jurisdiction — Employee Employment Agreements cannot be issued until one is approved.`,
    };
  }

  return { ok: true, state: "APPROVED_SCHEDULE_AVAILABLE", workforceJurisdiction };
}
