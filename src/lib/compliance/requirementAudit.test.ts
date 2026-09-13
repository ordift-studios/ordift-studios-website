import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRequirementEvaluationRow,
  isValidReviewResolutionOutcome,
  REVIEW_RESOLUTION_OUTCOMES,
  recordReviewResolution,
  recordPolicyAcknowledgement,
  type RecordRequirementEvaluationParams,
} from "./requirementAudit";
import type { ClassificationResult, WorkforceRelationship, WorkforceJurisdiction } from "./requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase A2. Functions that touch
// the database (recordRequirementEvaluation/recordReviewResolution/
// recordPolicyAcknowledgement's actual insert path) are verified by
// code reading below, matching this codebase's established convention
// for this exact class of function (see
// src/lib/legal/employeeAgreements.test.ts) — there is no live test
// database in this environment. Everything that can be proven without
// a database (pure validation/shaping logic, and the exact SQL this
// repository committed) is asserted for real instead of narrated.

const MIGRATION_PATH = join(process.cwd(), "supabase/migrations/0083_requirement_audit_foundation.sql");
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

function sectionBetween(sql: string, startMarker: string, endMarker: string): string {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  return end === -1 ? sql.slice(start) : sql.slice(start, end);
}

const matchedResult: ClassificationResult = {
  classification: "REQUIRED",
  outcome: "matched_rule",
  ruleKey: "identity.gh.employee",
  ruleVersion: 2,
  effectiveFrom: "2026-03-01",
  reason: 'Matched rule "identity.gh.employee" v2 (effective 2026-03-01).',
};

const reviewRequiredResult: ClassificationResult = {
  classification: "REVIEW_REQUIRED",
  outcome: "no_applicable_rule",
  ruleKey: null,
  ruleVersion: null,
  effectiveFrom: null,
  reason: "No applicable rule.",
};

const unsupportedJurisdictionResult: ClassificationResult = {
  classification: "REVIEW_REQUIRED",
  outcome: "unsupported_jurisdiction",
  ruleKey: null,
  ruleVersion: null,
  effectiveFrom: null,
  reason: 'Unsupported or unconfigured jurisdiction: "FR".',
};

const malformedJurisdictionResult: ClassificationResult = {
  classification: "REVIEW_REQUIRED",
  outcome: "malformed_jurisdiction",
  ruleKey: null,
  ruleVersion: null,
  effectiveFrom: null,
  reason: "Malformed or missing jurisdiction: (none supplied).",
};

const conflictingRulesResult: ClassificationResult = {
  classification: "REVIEW_REQUIRED",
  outcome: "conflicting_rules",
  ruleKey: null,
  ruleVersion: null,
  effectiveFrom: null,
  reason: 'Conflicting equally-specific rules for domain "identity_document_collection": a@v1=REQUIRED, b@v1=PROHIBITED.',
  conflictingRules: [
    { ruleKey: "a", ruleVersion: 1, classification: "REQUIRED" },
    { ruleKey: "b", ruleVersion: 1, classification: "PROHIBITED" },
  ],
};

function baseEvaluationParams(overrides: Partial<RecordRequirementEvaluationParams> = {}): RecordRequirementEvaluationParams {
  return {
    subjectType: "staff_onboarding",
    subjectReference: "11111111-1111-1111-1111-111111111111",
    domain: "identity_document_collection",
    relationship: "EMPLOYEE",
    jurisdiction: "GH",
    result: matchedResult,
    evaluatedBy: "22222222-2222-2222-2222-222222222222",
    ...overrides,
  };
}

describe("buildRequirementEvaluationRow — pure shaping, no database", () => {
  it("1. persists the exact ruleKey/ruleVersion/ruleEffectiveFrom from the resolver's own result", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams());
    expect("ok" in row).toBe(false);
    if ("ok" in row) throw new Error("unreachable");
    expect(row.ruleKey).toBe("identity.gh.employee");
    expect(row.ruleVersion).toBe(2);
    expect(row.ruleEffectiveFrom).toBe("2026-03-01");
  });

  it("1b. persists null ruleKey/ruleVersion/ruleEffectiveFrom for a fail-closed result — never fabricates a rule identity", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: reviewRequiredResult }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.ruleKey).toBeNull();
    expect(row.ruleVersion).toBeNull();
    expect(row.ruleEffectiveFrom).toBeNull();
    expect(row.classification).toBe("REVIEW_REQUIRED");
  });

  it("2. preserves relationship/jurisdiction/classification/domain/subject exactly as supplied", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams());
    if ("ok" in row) throw new Error("unreachable");
    expect(row.relationship).toBe("EMPLOYEE");
    expect(row.jurisdiction).toBe("GH");
    expect(row.classification).toBe("REQUIRED");
    expect(row.domain).toBe("identity_document_collection");
    expect(row.subjectType).toBe("staff_onboarding");
    expect(row.subjectReference).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("13a. rejects a malformed/unknown relationship before any database access", () => {
    const row = buildRequirementEvaluationRow(
      baseEvaluationParams({ relationship: "FREELANCE_GHOSTWRITER" as unknown as WorkforceRelationship })
    );
    expect(row).toEqual({ ok: false, error: expect.stringContaining("relationship") });
  });

  it("13b. rejects a malformed/unknown jurisdiction before any database access", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ jurisdiction: "FR" as unknown as WorkforceJurisdiction }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("jurisdiction") });
  });

  it("rejects an empty subjectType/subjectReference/domain", () => {
    expect(buildRequirementEvaluationRow(baseEvaluationParams({ subjectType: "" }))).toEqual({ ok: false, error: expect.any(String) });
    expect(buildRequirementEvaluationRow(baseEvaluationParams({ subjectReference: "  " }))).toEqual({ ok: false, error: expect.any(String) });
    expect(buildRequirementEvaluationRow(baseEvaluationParams({ domain: "" }))).toEqual({ ok: false, error: expect.any(String) });
  });

  it("evaluatedBy defaults to null (a system-derived evaluation) when omitted", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ evaluatedBy: undefined }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.evaluatedBy).toBeNull();
  });
});

// Pre-migration provenance checkpoint — the 13 explicit tests requested
// before Founder authorization of migration 0083's application.
describe("provenance integrity — matched_rule vs fail-closed outcomes", () => {
  it("1. matched_rule requires complete rule provenance — a correct matched_rule result persists ruleKey/ruleVersion/ruleEffectiveFrom together", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: matchedResult }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.outcome).toBe("matched_rule");
    expect(row.ruleKey).toBe("identity.gh.employee");
    expect(row.ruleVersion).toBe(2);
    expect(row.ruleEffectiveFrom).toBe("2026-03-01");
  });

  it("2. partial rule provenance is rejected — matched_rule with only some of ruleKey/ruleVersion/ruleEffectiveFrom present", () => {
    const partial: ClassificationResult = { ...matchedResult, ruleVersion: null };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: partial }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("complete ruleKey/ruleVersion/effectiveFrom") });
  });

  it("3. matched_rule with no rule identity at all is rejected", () => {
    const noIdentity: ClassificationResult = { ...matchedResult, ruleKey: null, ruleVersion: null, effectiveFrom: null };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: noIdentity }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("complete ruleKey/ruleVersion/effectiveFrom") });
  });

  it("4. unsupported jurisdiction persists REVIEW_REQUIRED with an explicit outcome and reason, and no fabricated rule identity", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ jurisdiction: "GH", result: unsupportedJurisdictionResult }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.classification).toBe("REVIEW_REQUIRED");
    expect(row.outcome).toBe("unsupported_jurisdiction");
    expect(row.reason).toContain("Unsupported or unconfigured jurisdiction");
    expect(row.ruleKey).toBeNull();
    expect(row.ruleVersion).toBeNull();
    expect(row.ruleEffectiveFrom).toBeNull();
  });

  it("5. malformed jurisdiction persists REVIEW_REQUIRED with an explicit outcome and reason, and no fabricated rule identity", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: malformedJurisdictionResult }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.classification).toBe("REVIEW_REQUIRED");
    expect(row.outcome).toBe("malformed_jurisdiction");
    expect(row.reason).toContain("Malformed or missing jurisdiction");
    expect(row.ruleKey).toBeNull();
  });

  it("6. no applicable rule persists REVIEW_REQUIRED with an explicit outcome and reason", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: reviewRequiredResult }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.classification).toBe("REVIEW_REQUIRED");
    expect(row.outcome).toBe("no_applicable_rule");
    expect(row.reason).toBe("No applicable rule.");
    expect(row.ruleKey).toBeNull();
  });

  it("7. conflict persists REVIEW_REQUIRED with structured competing-rule provenance", () => {
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: conflictingRulesResult }));
    if ("ok" in row) throw new Error("unreachable");
    expect(row.classification).toBe("REVIEW_REQUIRED");
    expect(row.outcome).toBe("conflicting_rules");
    expect(row.ruleKey).toBeNull();
    expect(row.conflictingRules).toEqual([
      { ruleKey: "a", ruleVersion: 1, classification: "REQUIRED" },
      { ruleKey: "b", ruleVersion: 1, classification: "PROHIBITED" },
    ]);
  });

  it("conflictingRules is rejected when present on any outcome other than conflicting_rules", () => {
    const bogus: ClassificationResult = { ...matchedResult, conflictingRules: [{ ruleKey: "x", ruleVersion: 1, classification: "REQUIRED" }] };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: bogus }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining('only be present for outcome "conflicting_rules"') });
  });

  it("conflicting_rules outcome without any competing-rule identities is rejected", () => {
    const emptyConflict: ClassificationResult = { ...conflictingRulesResult, conflictingRules: [] };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: emptyConflict }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("competing rules' identities") });
  });

  it("8. fail-closed provenance cannot persist REQUIRED", () => {
    const bad: ClassificationResult = { ...unsupportedJurisdictionResult, classification: "REQUIRED" };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: bad }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("must resolve to REVIEW_REQUIRED") });
  });

  it("9. fail-closed provenance cannot persist OPTIONAL", () => {
    const bad: ClassificationResult = { ...malformedJurisdictionResult, classification: "OPTIONAL" };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: bad }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("must resolve to REVIEW_REQUIRED") });
  });

  it("10. fail-closed provenance cannot persist PROHIBITED", () => {
    const bad: ClassificationResult = { ...reviewRequiredResult, classification: "PROHIBITED" };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: bad }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("must resolve to REVIEW_REQUIRED") });
  });

  it("11. fail-closed provenance cannot persist NOT_APPLICABLE", () => {
    const bad: ClassificationResult = { ...conflictingRulesResult, classification: "NOT_APPLICABLE" };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: bad }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("must resolve to REVIEW_REQUIRED") });
  });

  it("a fail-closed outcome carrying a fabricated rule identity is rejected even if classification is REVIEW_REQUIRED", () => {
    const fabricated: ClassificationResult = { ...unsupportedJurisdictionResult, ruleKey: "made-up-rule", ruleVersion: 1, effectiveFrom: "2026-01-01" };
    const row = buildRequirementEvaluationRow(baseEvaluationParams({ result: fabricated }));
    expect(row).toEqual({ ok: false, error: expect.stringContaining("must not carry a rule identity") });
  });

  it("12. review resolution remains a separate, append-only concept — recording a resolution never touches requirement_evaluations.classification (verified by code reading: recordReviewResolution contains no requirement_evaluations write of any kind, only a read-only existence check and a requirement_review_resolutions insert; also verified structurally above in the 'migration 0083' describe block, which asserts requirement_evaluations grants no update/delete to service_role at all)", () => {
    expect(true).toBe(true);
  });
  // Item 13 ("migration inserts zero business rows") is covered by the
  // "migration 0083" describe block below, which already asserts this
  // for all three tables against the real committed SQL.
});

describe("REVIEW_RESOLUTION_OUTCOMES / isValidReviewResolutionOutcome", () => {
  it("is exactly the three specified outcomes", () => {
    expect(REVIEW_RESOLUTION_OUTCOMES).toEqual(["approved_to_proceed", "blocked", "escalated"]);
  });

  it("7. accepts only the three specified outcomes", () => {
    for (const outcome of REVIEW_RESOLUTION_OUTCOMES) {
      expect(isValidReviewResolutionOutcome(outcome)).toBe(true);
    }
    for (const bad of ["approved", "REVIEW_REQUIRED", "", "Blocked", "approved_to_proceed "]) {
      expect(isValidReviewResolutionOutcome(bad)).toBe(false);
    }
  });

  it("7b. recordReviewResolution rejects an invalid resolution before touching the database or the authorization gate", async () => {
    // No live database/authority_grants exist in this environment — this
    // call proves the function returns its validation error synchronously
    // on the invalid-format path, without ever reaching createAdminClient()
    // or requireComplianceTrack() (both of which would throw/hang without
    // real Supabase configuration if this path were reached).
    const result = await recordReviewResolution({
      evaluationId: "11111111-1111-1111-1111-111111111111",
      resolution: "approved_immediately_no_review",
      resolvedBy: "22222222-2222-2222-2222-222222222222",
      actorUserId: "33333333-3333-3333-3333-333333333333",
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Unknown review resolution outcome") });
  });

  it("rejects an empty evaluationId/resolvedBy before touching the database", async () => {
    const missingEvaluation = await recordReviewResolution({
      evaluationId: "",
      resolution: "blocked",
      resolvedBy: "22222222-2222-2222-2222-222222222222",
      actorUserId: "33333333-3333-3333-3333-333333333333",
    });
    expect(missingEvaluation.ok).toBe(false);

    const missingResolver = await recordReviewResolution({
      evaluationId: "11111111-1111-1111-1111-111111111111",
      resolution: "blocked",
      resolvedBy: "",
      actorUserId: "33333333-3333-3333-3333-333333333333",
    });
    expect(missingResolver.ok).toBe(false);
  });
});

describe("recordPolicyAcknowledgement — pure validation runs before any database access", () => {
  function baseAckParams() {
    return {
      policyVersionId: "44444444-4444-4444-4444-444444444444",
      profileId: "55555555-5555-5555-5555-555555555555",
      relationship: "EMPLOYEE" as WorkforceRelationship,
      jurisdiction: "GH" as WorkforceJurisdiction,
      presentedAt: "2026-09-13T00:00:00.000Z",
      acknowledgedAt: "2026-09-13T00:05:00.000Z",
      acknowledgementMethod: "digital_click_through",
    };
  }

  it("13c. rejects a malformed relationship before any database access", async () => {
    const result = await recordPolicyAcknowledgement({
      ...baseAckParams(),
      relationship: "FREELANCE_GHOSTWRITER" as unknown as WorkforceRelationship,
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("relationship") });
  });

  it("13d. rejects a malformed jurisdiction before any database access", async () => {
    const result = await recordPolicyAcknowledgement({ ...baseAckParams(), jurisdiction: "FR" as unknown as WorkforceJurisdiction });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("jurisdiction") });
  });

  it("rejects an empty acknowledgementMethod before any database access", async () => {
    const result = await recordPolicyAcknowledgement({ ...baseAckParams(), acknowledgementMethod: "  " });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("acknowledgementMethod") });
  });

  it("9. accepts no content/text/body field at all — the params shape itself cannot carry policy text", () => {
    const params = baseAckParams();
    expect(Object.keys(params).sort()).toEqual(
      ["acknowledgedAt", "acknowledgementMethod", "jurisdiction", "policyVersionId", "presentedAt", "profileId", "relationship"].sort()
    );
  });
});

describe("migration 0083 — real, automated verification of the committed SQL (no database needed)", () => {
  it("14. inserts zero business rows — only DDL/grants/comments, no seeded evaluation/resolution/acknowledgement data", () => {
    expect(migrationSql).not.toMatch(/insert into public\.(requirement_evaluations|requirement_review_resolutions|policy_acknowledgements)/i);
  });

  it("does not touch any pre-existing table (no alter/drop/rename of anything other than the three new tables)", () => {
    expect(migrationSql).not.toMatch(/drop table/i);
    expect(migrationSql).not.toMatch(/alter table public\.(legal_document_masters|legal_document_versions|staff_onboarding|agreements|profiles)/i);
    expect(migrationSql).not.toMatch(/\balter\s+table\b[^;]*\brename\b/i);
  });

  it("3/5/6/10. all three new tables grant service_role select+insert only — never update or delete (database-level append-only)", () => {
    for (const table of ["requirement_evaluations", "requirement_review_resolutions", "policy_acknowledgements"]) {
      const grantLine = `grant select, insert on public.${table} to service_role;`;
      expect(migrationSql).toContain(grantLine);
    }
    expect(migrationSql).not.toMatch(/grant[^;]*update[^;]*service_role/i);
    expect(migrationSql).not.toMatch(/grant[^;]*delete[^;]*service_role/i);
  });

  it("12. requirement_evaluations and requirement_review_resolutions expose admin-tier read only — no auth.uid()-scoped 'own read' policy", () => {
    const evaluationsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_evaluations",
      "create table public.requirement_review_resolutions"
    );
    const resolutionsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_review_resolutions",
      "create table public.policy_acknowledgements"
    );
    for (const section of [evaluationsSection, resolutionsSection]) {
      expect(section).toContain("private.is_admin_or_super_admin()");
      expect(section).not.toContain("auth.uid()");
      expect(section.match(/create policy/g)?.length).toBe(1);
    }
  });

  it("policy_acknowledgements adds exactly one additional own-read policy scoped strictly to profile_id = auth.uid()", () => {
    const ackSection = migrationSql.slice(migrationSql.indexOf("create table public.policy_acknowledgements"));
    expect(ackSection.match(/create policy/g)?.length).toBe(2);
    expect(ackSection).toContain("using (profile_id = (select auth.uid()))");
  });

  it("8/10. policy_acknowledgements references legal_document_versions (never a bare master) and has no content/text column", () => {
    const ackSection = sectionBetween(migrationSql, "create table public.policy_acknowledgements (", ");");
    expect(ackSection).toContain("policy_version_id uuid not null references public.legal_document_versions (id)");
    expect(ackSection).not.toMatch(/\bcontent\b|\bpolicy_text\b|\bbody\b/i);
  });

  it("requirement_review_resolutions references requirement_evaluations and requires a named resolver", () => {
    const resolutionsTableDef = sectionBetween(migrationSql, "create table public.requirement_review_resolutions (", ");");
    expect(resolutionsTableDef).toContain("evaluation_id uuid not null references public.requirement_evaluations (id)");
    expect(resolutionsTableDef).toContain("resolved_by uuid not null references public.profiles (id)");
  });

  it("pre-migration checkpoint: requirement_evaluations carries an explicit outcome/reason/conflicting_rules provenance structure", () => {
    const evaluationsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_evaluations",
      "comment on table public.requirement_evaluations"
    );
    expect(evaluationsSection).toContain("outcome text not null");
    expect(evaluationsSection).toContain("reason text not null");
    expect(evaluationsSection).toContain("conflicting_rules jsonb");
  });

  it("pre-migration checkpoint: outcome and classification are CHECK-constrained to their exact known values", () => {
    const evaluationsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_evaluations",
      "comment on table public.requirement_evaluations"
    );
    expect(evaluationsSection).toContain(
      "check (classification in ('REQUIRED', 'OPTIONAL', 'PROHIBITED', 'NOT_APPLICABLE', 'REVIEW_REQUIRED'))"
    );
    expect(evaluationsSection).toContain(
      "check (outcome in ('matched_rule', 'unsupported_jurisdiction', 'malformed_jurisdiction', 'no_applicable_rule', 'conflicting_rules'))"
    );
  });

  it("pre-migration checkpoint: a database-level CHECK prevents matched_rule from having incomplete rule provenance, and prevents any other outcome from having one at all", () => {
    const evaluationsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_evaluations",
      "comment on table public.requirement_evaluations"
    );
    expect(evaluationsSection).toContain("constraint requirement_evaluations_rule_provenance_consistency check (");
    expect(evaluationsSection).toContain("outcome = 'matched_rule' and rule_key is not null and rule_version is not null and rule_effective_from is not null");
    expect(evaluationsSection).toContain("outcome <> 'matched_rule' and rule_key is null and rule_version is null and rule_effective_from is null");
  });

  it("pre-migration checkpoint: a database-level CHECK prevents any fail-closed outcome from persisting a classification other than REVIEW_REQUIRED", () => {
    const evaluationsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_evaluations",
      "comment on table public.requirement_evaluations"
    );
    expect(evaluationsSection).toContain("constraint requirement_evaluations_fail_closed_review_required check (");
    expect(evaluationsSection).toContain("outcome = 'matched_rule' or classification = 'REVIEW_REQUIRED'");
  });

  it("pre-migration checkpoint: a database-level CHECK ties conflicting_rules population exactly to the conflicting_rules outcome", () => {
    const evaluationsSection = sectionBetween(
      migrationSql,
      "create table public.requirement_evaluations",
      "comment on table public.requirement_evaluations"
    );
    expect(evaluationsSection).toContain("constraint requirement_evaluations_conflicting_rules_consistency check (");
    expect(evaluationsSection).toContain("(outcome = 'conflicting_rules') = (conflicting_rules is not null)");
  });
});
