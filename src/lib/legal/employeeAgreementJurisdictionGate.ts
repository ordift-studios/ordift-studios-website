import { mapEmploymentJurisdictionToWorkforceJurisdiction } from "@/lib/compliance/workforceMappings";
import type { WorkforceJurisdiction } from "@/lib/compliance/requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B2 Step 1 (2026-09-14).
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
// counsel-adapted, jurisdiction-specific schedule before real use — for
// every one of the six named jurisdictions, including Ghana. Nothing in
// this module infers schedule existence from OS-LGL-007's own
// content_reference, from Schedule C's wording, from employment_jurisdictions,
// or from whether src/lib/legal/jurisdictionRouting.ts happens to
// recognize a jurisdiction string — none of those are evidence that a
// real, approved schedule exists.
//
// NO JURISDICTION-SCHEDULE REGISTRY/STORAGE EXISTS YET. Phase B2A's
// read-only design confirmed no suitable existing structure represents
// this: legal_document_masters/legal_document_versions carry no
// jurisdiction column, and agreements.jurisdiction is a per-ISSUED-
// AGREEMENT field, not a per-master approved-schedule artifact. Building
// that registry is a separate, later, separately authorized phase
// (design only in the Phase B2A report — no migration created or
// proposed here). findApprovedJurisdictionSchedule() below is the ONLY
// place that will need to change when that registry exists — its
// signature and the gate's overall result contract are deliberately
// stable across that future swap.

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

// Placeholder lookup — deliberately returns "not found" for every
// jurisdiction today, because no approved jurisdiction-specific Schedule
// C artifact exists for any of them (confirmed against Production,
// 2026-09-13/14: zero rows in every candidate table, and no dedicated
// schedule table exists at all). Kept async so a future real repository
// lookup (once one is designed and separately authorized) can replace
// this function's body without changing its signature or the gate's
// overall contract. Never fabricates a schedule — there is deliberately
// no code path here that can return `found: true` today.
async function findApprovedJurisdictionSchedule(
  masterCanonicalCode: string,
  jurisdiction: WorkforceJurisdiction
): Promise<{ found: false } | { found: true; scheduleId: string }> {
  void masterCanonicalCode;
  void jurisdiction;
  return { found: false };
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
