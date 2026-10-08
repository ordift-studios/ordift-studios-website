import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessAgreementWorkflow, CLIENT_AGREEMENT_ISSUANCE_SUPPORTED, CREW_SUPPORT_AGREEMENT_TEMPLATE_CODES, type MasterFact } from "./agreementTemplates";
import { assessAgreement, confirmationBlockers, describeContractBasis, validateAgreementRequirementChange } from "./commitmentRules";

const masters: MasterFact[] = [
  { canonicalCode: "OS-LGL-014", title: "Client Service Terms & General Booking Agreement", classification: "transaction_agreement", versionStatuses: ["active", "approved"] },
  { canonicalCode: "OS-LGL-016", title: "Privacy Notice", classification: "public_legal_document", versionStatuses: ["active"] },
  { canonicalCode: "OS-LGL-099", title: "Draft agreement", classification: "transaction_agreement", versionStatuses: ["draft"] },
];

describe("a required separate agreement can never become an unusable workflow", () => {
  it("TODAY (no designated template, no client-agreement issuance flow) it is unavailable and says exactly what is missing", () => {
    expect(CREW_SUPPORT_AGREEMENT_TEMPLATE_CODES).toEqual([]);
    expect(CLIENT_AGREEMENT_ISSUANCE_SUPPORTED).toBe(false);
    const s = assessAgreementWorkflow({ designatedCodes: CREW_SUPPORT_AGREEMENT_TEMPLATE_CODES, masters, issuanceSupported: CLIENT_AGREEMENT_ISSUANCE_SUPPORTED });
    expect(s.available).toBe(false);
    if (!s.available) {
      expect(s.missing).toHaveLength(2);
      expect(s.explanation).toMatch(/No approved legal template has been designated/);
      expect(s.explanation).toMatch(/OS-LGL-014 Client Service Terms/); // approved candidates are listed, never chosen
      expect(s.explanation).toMatch(/can't yet issue a client agreement/);
      expect(s.explanation).toMatch(/use the standard route/);
      expect(s.explanation).not.toMatch(/OS-LGL-016|OS-LGL-099/); // public documents and drafts aren't offered
    }
  });
  it("a designated template that is not approved is reported", () => {
    const s = assessAgreementWorkflow({ designatedCodes: ["OS-LGL-099"], masters, issuanceSupported: true });
    expect(s.available).toBe(false);
    if (!s.available) expect(s.explanation).toMatch(/OS-LGL-099\) is not approved/);
  });
  it("only a designated, approved template AND an issuance flow make it available", () => {
    expect(assessAgreementWorkflow({ designatedCodes: ["OS-LGL-014"], masters, issuanceSupported: true })).toEqual({ available: true });
    expect(assessAgreementWorkflow({ designatedCodes: ["OS-LGL-014"], masters, issuanceSupported: false }).available).toBe(false);
  });
  it("the requirement cannot be set while the workflow is unavailable, with the reason", () => {
    const r = validateAgreementRequirementChange({ required: true, reason: "bespoke IP", requestStatus: "quoted", workflowUnavailableReason: "No template." });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/can't be required yet: No template\./);
    expect(validateAgreementRequirementChange({ required: false, reason: "", requestStatus: "quoted", workflowUnavailableReason: "No template." }).ok).toBe(true); // clearing is always allowed
    expect(validateAgreementRequirementChange({ required: true, reason: "bespoke IP", requestStatus: "quoted", workflowUnavailableReason: null }).ok).toBe(true);
  });
  it("an already-required request (legacy) is blocked at confirmation with the missing items spelled out", () => {
    const a = assessAgreement({ required: true, reason: "IP", hasExecutedAgreement: false, quotationTerms: "x".repeat(20), workflowUnavailableReason: "No template designated." });
    expect(a.satisfied).toBe(false);
    const blockers = confirmationBlockers({ hasAcceptedQuotation: true, agreement: a, slots: [], isTest: false });
    expect(blockers.join(" ")).toMatch(/none can be produced: No template designated\./);
    expect(blockers.join(" ")).toMatch(/Clear the requirement to use the standard quotation terms/);
  });
  it("an EXECUTED agreement still satisfies it even if the workflow flag is off (nothing unsigned is ever treated as executed, nothing signed is ignored)", () => {
    expect(assessAgreement({ required: true, reason: "IP", hasExecutedAgreement: true, quotationTerms: null, workflowUnavailableReason: "No template." })).toEqual({ satisfied: true, basis: "agreement_executed" });
  });
  it("the Contract basis explains it in the panel", () => {
    const v = describeContractBasis({ required: true, reason: "IP", hasExecutedAgreement: false, quotation: "pending", quotationTerms: "x".repeat(20), workflowUnavailableReason: "No template designated." });
    expect(v.tone).toBe("incomplete");
    expect(v.headline).toBe("Separate agreement required — cannot be produced yet");
    expect(v.detail).toMatch(/Confirmation is blocked/);
  });
  it("issuing is prevented at both ready and issue, for a request that depends on an unproducible agreement", () => {
    const q = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
    expect(q.match(/agreementDeadEnd\(quote\.requestId\)/g)?.length).toBe(2);
    const ready = q.slice(q.indexOf("export async function markQuotationReady"), q.indexOf("export async function returnQuotationToDraft"));
    expect(ready.indexOf("agreementDeadEnd")).toBeGreaterThan(-1);
    expect(q).toContain("Clear the requirement (Commitment readiness) before issuing.");
  });
  it("the control is replaced by an explanation when unavailable, and the setter enforces it server-side", () => {
    const panel = readFileSync("src/app/admin/crew-support/CommitmentPanel.tsx", "utf8");
    expect(panel).toContain("snapshot.agreementWorkflowAvailable");
    expect(panel).toContain("“Require a separate agreement” is unavailable.");
    expect(readFileSync("src/lib/crewSupport/commitment.ts", "utf8")).toContain("workflowUnavailableReason: snapshot.agreement.workflowUnavailableReason");
  });
});
