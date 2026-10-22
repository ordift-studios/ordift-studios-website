import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../../app/admin/organization/onboarding/[onboardingId]/page.tsx");

describe("the guided journey adds no way to change a record and no new access", () => {
  it("the page still refuses anyone who cannot manage onboarding BEFORE any journey or legal data is loaded", () => {
    const gate = page.indexOf("canManageOnboarding(currentUser.id)");
    expect(gate).toBeGreaterThan(-1);
    expect(page.indexOf("loadAgreementReadiness(")).toBeGreaterThan(gate);
    expect(page.indexOf("buildJourney(")).toBeGreaterThan(gate);
    expect(page.slice(gate, gate + 120)).toContain("redirect(");
  });
  it("the new journey modules and loader contain no write calls, sends or status transitions", () => {
    const files = ["./onboardingJourney.ts", "../legal/agreementReadiness.ts", "../legal/agreementReadinessData.ts", "../legal/approvalAttestation.ts", "../legal/masterContentReference.ts", "../../components/admin/OnboardingJourneyPanel.tsx"];
    for (const f of files) {
      const src = read(f);
      for (const verb of [".insert(", ".update(", ".upsert(", ".delete(", "sendEmail", "transitionLegalDocumentVersionStatus", "advanceOnboardingStage", "createDraftAgreement", "use server"]) expect(src, `${f} must not contain ${verb}`).not.toContain(verb);
    }
  });
  it("the panel has no form or button: every change goes through the existing forms lower on the same page", () => {
    const panel = read("../../components/admin/OnboardingJourneyPanel.tsx");
    expect(panel).not.toMatch(/<form|<button|action=\{/);
  });
  it("the attestation migration is a proposal outside supabase/migrations", () => {
    const sql = read("../../../supabase/proposals/PROPOSED_legal_approval_attestations.sql");
    expect(sql.split("\n")[0]).toContain("PROPOSED - NOT APPLIED");
  });
});
