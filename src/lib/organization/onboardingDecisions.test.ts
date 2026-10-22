import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, authorized: true }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({
  logActivity: async (e: { action: string; entityId: string; metadata: Record<string, unknown> }) => { h.db.tables.activity_log.push({ action: e.action, entity_id: e.entityId, metadata: e.metadata, created_at: `2026-10-30T10:00:${String(h.db.tables.activity_log.length).padStart(2, "0")}Z` }); },
}));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: h.authorized }), GOVERNANCE_CAPABILITIES: { contractAdminister: "x" } }));

import { confirmContractingEntity, loadOnboardingDecisions, selectAgreementSignatory } from "./onboardingDecisions";

beforeEach(() => {
  h.authorized = true;
  h.db = makeFakeDb({
    staff_onboarding: [{ id: "ob1", profile_id: "kwaku" }],
    employing_entities: [
      { id: "gh", name: "Ordift Studios", active: true, verification_status: "verified", jurisdiction_id: "jGH" },
      { id: "qa", name: "Ordift Studios (Qatar)", active: true, verification_status: "verified", jurisdiction_id: "jQA" },
      { id: "un", name: "Unverified Ltd", active: true, verification_status: "unverified", jurisdiction_id: "jGH" },
    ],
    employment_jurisdictions: [{ id: "jGH", name: "Ghana" }, { id: "jQA", name: "Qatar" }],
    entity_signatories: [{ id: "s1", full_name: "A Signatory", employing_entity_id: "gh", effective_to: null, source_document_id: "d1" }],
    activity_log: [],
  });
});

describe("contracting-entity and signatory decisions", () => {
  it("confirms the verified Ghana entity for a Ghana onboarding and reads it back", async () => {
    expect((await confirmContractingEntity({ onboardingId: "ob1", entityId: "gh", expectedJurisdiction: "Ghana", actorUserId: "f" })).ok).toBe(true);
    expect((await loadOnboardingDecisions("ob1")).entityId).toBe("gh");
  });
  it("never accepts the Qatar W.L.L. for Ghana, an unverified entity, or an unauthorised caller", async () => {
    expect((await confirmContractingEntity({ onboardingId: "ob1", entityId: "qa", expectedJurisdiction: "Ghana", actorUserId: "f" })).ok).toBe(false);
    expect((await confirmContractingEntity({ onboardingId: "ob1", entityId: "un", expectedJurisdiction: "Ghana", actorUserId: "f" })).ok).toBe(false);
    h.authorized = false;
    expect((await confirmContractingEntity({ onboardingId: "ob1", entityId: "gh", expectedJurisdiction: "Ghana", actorUserId: "x" })).ok).toBe(false);
    expect(h.db.tables.activity_log).toEqual([]);
  });
  it("a signatory can only be selected from the confirmed entity's own current signatories", async () => {
    expect((await selectAgreementSignatory({ onboardingId: "ob1", entityId: "qa", signatoryId: "s1", actorUserId: "f" })).ok).toBe(false);
    expect((await selectAgreementSignatory({ onboardingId: "ob1", entityId: "gh", signatoryId: "s1", actorUserId: "f" })).ok).toBe(true);
    expect((await loadOnboardingDecisions("ob1")).signatoryId).toBe("s1");
  });
});
