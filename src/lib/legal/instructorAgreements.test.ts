import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./fakeAdmin.testkit";
import type { AgreementReadiness } from "./agreementReadiness";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, calls: [] as { fn: string; args: Record<string, unknown> }[] }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("./fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("./agreementEngine", () => ({
  createDraftAgreement: async (a: Record<string, unknown>) => { h.calls.push({ fn: "createDraft", args: a }); return { ok: true, agreementId: "agr1", agreementReference: "ORD-AGR-2026-000099" }; },
  addAgreementParty: async (a: Record<string, unknown>) => { h.calls.push({ fn: "addParty", args: a }); return { ok: true, partyId: "p" }; },
  attachAgreementSnapshot: async (a: Record<string, unknown>) => { h.calls.push({ fn: "snapshot", args: a }); return { ok: true, snapshotId: "s" }; },
}));
vi.mock("./agreementReadinessData", () => ({ loadAgreementReadiness: async () => null }));

import { getCurrentInstructorAgreement, prepareInstructorAgreementDraft } from "./instructorAgreements";

const readiness = (canIssue: boolean): AgreementReadiness => ({ code: "OS-LGL-010", title: "t", checks: [], canIssue, unresolved: canIssue ? [] : [{ key: "approval_date", label: "Verify historical legal approval", state: "missing", detail: "", guide: null, actionKey: "attest_approval" }], context: { versionId: "v1", approvalDate: null, entity: null, recordedEntityId: null, candidates: [], founder: null, governance: [] } });

beforeEach(() => {
  h.calls = [];
  h.db = makeFakeDb({
    staff_onboarding: [{ id: "ob1", profile_id: "kwaku", requisition_id: "rq1", documents_received: [] }],
    recruitment_requisitions: [{ id: "rq1", employment_jurisdiction_id: "jGH", employing_entity_id: "gh" }],
    employment_jurisdictions: [{ id: "jGH", name: "Ghana" }],
    profiles: [{ id: "kwaku", full_name: "Kwaku Darko Gyimah", member_number: "INT0001" }],
    staff_details: [{ id: "kwaku", engagement_type_id: "t1" }],
    engagement_types: [{ id: "t1", slug: "instructor" }],
    legal_document_masters: [{ id: "m1", canonical_code: "OS-LGL-010", current_version_id: "v1" }],
    legal_document_versions: [{ id: "v1", content_reference: "legal-masters:x", document_hash: "h", effective_date: "2026-09-05", approved_at: null }],
    employing_entities: [{ id: "gh", name: "Ordift Studios", legal_name: "Ordift Studios", registration_type: "Registered Business Name", registration_date: "2018-05-07" }],
    entity_signatories: [{ id: "s1", employing_entity_id: "gh", full_name: "A Signatory", position: "Proprietor", authority: "As stated", source_document_id: "d1", profile_id: null, effective_to: null }],
    activity_log: [{ action: "onboarding.contracting_entity_confirmed", entity_id: "ob1", metadata: { entityId: "gh" }, created_at: "2026-10-30T10:00:00Z" }],
    agreements: [],
  });
});

describe("prepareInstructorAgreementDraft", () => {
  it("refuses, creating nothing, while any legal prerequisite is unresolved", async () => {
    const r = await prepareInstructorAgreementDraft({ onboardingId: "ob1", actorUserId: "f", readiness: async () => readiness(false) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.unresolved).toEqual(["Verify historical legal approval"]);
    expect(h.calls).toEqual([]);
  });
  it("refuses someone who is not classified as an instructor", async () => {
    h.db.tables.engagement_types[0].slug = "freelancer";
    expect((await prepareInstructorAgreementDraft({ onboardingId: "ob1", actorUserId: "f", readiness: async () => readiness(true) })).ok).toBe(false);
    expect(h.calls).toEqual([]);
  });
  it("creates ONLY a draft bound to the instructor's profile, from verified facts, and issues/sends nothing", async () => {
    const r = await prepareInstructorAgreementDraft({ onboardingId: "ob1", actorUserId: "f", readiness: async () => readiness(true) });
    expect(r).toEqual({ ok: true, agreementId: "agr1", agreementReference: "ORD-AGR-2026-000099" });
    expect(h.calls.map((c) => c.fn)).toEqual(["createDraft", "addParty", "addParty", "snapshot"]);
    expect(h.calls[0].args).toMatchObject({ primaryContextType: "instructor_profile", primaryContextReference: "kwaku", engagementJurisdiction: "Ghana", classification: "transaction_agreement" });
    const snap = h.calls[3].args.snapshotData as Record<string, Record<string, unknown>>;
    expect(snap.instructor).toMatchObject({ legalName: "Kwaku Darko Gyimah", memberNumber: "INT0001", email: "kwaku@example.test" });
    expect(snap.contractingEntity).toMatchObject({ name: "Ordift Studios" });
    expect(snap.signatory).toMatchObject({ name: "A Signatory", sourceDocumentId: "d1" });
    expect(JSON.stringify(snap)).not.toMatch(/executed|signed_at|fully_executed/);
  });
  it("refuses a second current agreement for the same person", async () => {
    h.db.tables.agreements.push({ id: "old", master_id: "m1", primary_context_type: "instructor_profile", primary_context_reference: "kwaku", status: "draft", agreement_reference: "ORD-AGR-1", created_at: "2026-10-01T00:00:00Z" });
    const r = await prepareInstructorAgreementDraft({ onboardingId: "ob1", actorUserId: "f", readiness: async () => readiness(true) });
    expect(!r.ok && r.error).toContain("already has a current Instructor Agreement");
    expect(await getCurrentInstructorAgreement("kwaku")).toMatchObject({ id: "old", status: "draft" });
  });
});
