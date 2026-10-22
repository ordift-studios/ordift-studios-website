import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../../app/admin/organization/onboarding/[onboardingId]/page.tsx");

describe("the guided journey adds no way to change a record and no new access", () => {
  it("the page still refuses anyone who cannot manage onboarding BEFORE any journey or legal data is loaded", () => {
    const gate = page.indexOf("canManageOnboarding(currentUser.id)");
    expect(gate).toBeGreaterThan(-1);
    expect(page.indexOf("loadAgreementReadiness(")).toBeGreaterThan(gate);
    expect(page.indexOf("buildInstructorWorkspace(")).toBeGreaterThan(gate);
    expect(page.slice(gate, gate + 120)).toContain("redirect(");
  });
  it("the new journey modules and loader contain no write calls, sends or status transitions", () => {
    const files = ["./instructorWorkspace.ts", "../workspace/processWorkspace.ts", "../legal/agreementReadiness.ts", "../legal/agreementReadinessData.ts", "../legal/approvalAttestation.ts", "../legal/masterContentReference.ts", "../legal/legalGovernance.ts", "../legal/docxText.ts", "../../components/admin/OnboardingJourneyPanel.tsx"];
    for (const f of files) {
      const src = read(f);
      for (const verb of [".insert(", ".update(", ".upsert(", ".delete(", "sendEmail", "transitionLegalDocumentVersionStatus", "advanceOnboardingStage", "createDraftAgreement", "use server"]) expect(src, `${f} must not contain ${verb}`).not.toContain(verb);
    }
  });
  it("the panel itself holds no form: change controls are the embedded forms, which only submit to the journey server actions", () => {
    const panel = read("../../components/admin/OnboardingJourneyPanel.tsx");
    expect(panel).not.toMatch(/<form|<button|action=\{/);
    const forms = read("../../components/admin/OnboardingJourneyForms.tsx");
    for (const a of ["attestApprovalAction", "registerMasterAction", "activateTemplateAction", "confirmEntityAction", "addSignatoryAction", "selectSignatoryAction", "prepareAgreementAction", "uploadEvidenceAction", "uploadApprovalEvidenceAction", "saveScheduleAAction", "approveForIssueAction", "issueAgreementAction"]) expect(forms).toContain(a);
  });
  it("every embedded server action first requires onboarding-management authority, then delegates to an authoritative function", () => {
    const actions = read("../../app/admin/organization/onboarding/[onboardingId]/journeyActions.ts");
    expect(actions.split("export async function ").length - 1).toBe(12);
    expect(actions.split("await actor(onboardingId)").length - 1).toBe(12);
    // the two record-changing legal steps that send or approve for sending need an explicit tick in the same submission
    expect(actions).toContain('d.get("confirmPreview") !== "yes"');
    expect(actions).toContain('d.get("confirmIssue") !== "yes"');
    expect(actions).toContain("canManageOnboarding(u.id)");
    for (const verb of [".insert(", ".update(", ".from(", "sendEmail", "createAdminClient"]) expect(actions, `actions must not write directly: ${verb}`).not.toContain(verb);
  });
  it("no embedded action issues, signs or sends: no lifecycle transition to sent/executed, no email, no invitation, no engagement", () => {
    for (const f of ["../legal/instructorAgreements.ts", "../legal/masterRegistryActions.ts", "../organization/onboardingDecisions.ts"]) {
      const src = read(f);
      for (const t of ["transitionAgreementStatus", "advanceAgreementToFullyExecuted", "sendEmail", "inviteCollaborator", "createInstructorEngagement", "payment_obligations"]) expect(src, `${f} must not use ${t}`).not.toContain(t);
    }
  });
  it("the evidence upload states and enforces the real server-action limit (1 MB), not the vault's 10 MB", () => {
    const forms = read("../../components/admin/OnboardingJourneyForms.tsx");
    const actions = read("../../app/admin/organization/onboarding/[onboardingId]/journeyActions.ts");
    expect(forms).toContain("STEP7_UPLOAD_MAX_LABEL");
    expect(forms).not.toContain("up to 10 MB");
    expect(actions).toContain("file.size > STEP7_UPLOAD_MAX_BYTES");
    expect(read("./onboardingUploadLimit.ts")).toContain("STEP7_UPLOAD_MAX_BYTES = 1_000_000");
  });
  it("the Step 6 form no longer asks for a typed fingerprint: the server computes it", () => {
    const forms = read("../../components/admin/OnboardingJourneyForms.tsx");
    const actions = read("../../app/admin/organization/onboarding/[onboardingId]/journeyActions.ts");
    expect(forms).not.toContain('name="evidenceSha256"');
    expect(forms).toContain('name="evidenceDocumentId"');
    expect(actions).not.toContain('f(d, "evidenceSha256")');
  });
  it("a pasted message is labelled as an administrator-supplied transcript, and unreadable PDFs carry a personal-review warning", () => {
    const actions = read("../../app/admin/organization/onboarding/[onboardingId]/journeyActions.ts");
    const forms = read("../../components/admin/OnboardingJourneyForms.tsx");
    expect(actions).toContain("ADMINISTRATOR-SUPPLIED TRANSCRIPT");
    expect(actions).toContain("not authenticated correspondence");
    expect(forms).toContain("the system does not read PDFs, so you must have read this source yourself");
  });
  it("no migration is part of this work: nothing was added under supabase/migrations or supabase/proposals", () => {
    expect(() => read("../../../supabase/proposals/PROPOSED_legal_approval_attestations.sql")).toThrow();
  });
});
