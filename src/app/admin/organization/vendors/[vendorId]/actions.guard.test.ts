import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeAdmin, type FakeTables } from "@/lib/organization/__testsupport__/fakeAdmin";
import { VENDOR_CONFLICT_MESSAGE, VENDOR_NOT_ELIGIBLE_MESSAGE } from "@/lib/organization/onboardingRelationship";

// Negative + regression tests for the 21 vendor-only server actions
// (Founder instruction 2026-10-21: "add server-side eligibility checks to
// all vendor actions"; the earlier report said 22 — the file exports 21,
// asserted below so a future addition cannot silently skip the guard).
// Real guard code (vendorEligibility.ts + onboardingRelationship.ts) runs
// against an in-memory database double; everything that WRITES or SENDS is
// a spy, so "refused" is proven by "no underlying function was called and
// no write was attempted".

const INSTRUCTOR = "instructor-profile";
const CONTRACTOR_BUSINESS = "contractor-business-profile";
const CONFLICT = "conflict-profile";
const MODEL = "model-profile";
const VENDOR = "vendor-profile";
const VENDOR_NO_TYPE = "vendor-role-only-profile";

const tables: FakeTables = {
  user_roles: [
    { user_id: INSTRUCTOR, roles: { slug: "contractor" } },
    { user_id: CONTRACTOR_BUSINESS, roles: { slug: "contractor" } },
    { user_id: CONFLICT, roles: { slug: "contractor" } },
    { user_id: MODEL, roles: { slug: "model" } },
    { user_id: VENDOR, roles: { slug: "client" } },
    { user_id: VENDOR, roles: { slug: "vendor" } },
    { user_id: VENDOR_NO_TYPE, roles: { slug: "vendor" } },
  ],
  staff_details: [
    { id: INSTRUCTOR, engagement_types: { slug: "instructor" } },
    { id: CONTRACTOR_BUSINESS, engagement_types: { slug: "independent_contractor" } },
    { id: CONFLICT, engagement_types: { slug: "vendor_supplier" } },
    { id: MODEL, engagement_types: { slug: "model_talent" } },
    { id: VENDOR, engagement_types: { slug: "vendor_supplier" } },
  ],
  staff_onboarding: [
    { id: "ob-instructor", profile_id: INSTRUCTOR, pipeline: "external_contractor" },
    { id: "ob-vendor", profile_id: VENDOR, pipeline: "external_contractor" },
  ],
  agreement_parties: [
    { id: "p1", agreement_id: "ag-vendor", party_role: "vendor", profile_id: VENDOR },
    { id: "p2", agreement_id: "ag-instructor", party_role: "vendor", profile_id: INSTRUCTOR },
  ],
  agreement_amendments: [
    { id: "am-vendor", agreement_id: "ag-vendor" },
    { id: "am-instructor", agreement_id: "ag-instructor" },
  ],
  vendor_documents: [
    { id: "doc-vendor", vendor_profile_id: VENDOR },
    { id: "doc-instructor", vendor_profile_id: INSTRUCTOR },
  ],
  engagement_types: [{ id: "et-vendor", slug: "vendor_supplier" }],
};

const fake = makeFakeAdmin(tables);

const spies = vi.hoisted(() => {
  const ok = () => vi.fn(async () => ({ ok: true as const }));
  return {
    canManageOnboarding: vi.fn(async () => true),
    getCurrentUser: vi.fn(async () => ({ id: "admin-1", roles: ["super_admin"] })),
    startExternalWorkforceOnboarding: ok(),
    advanceOnboardingStage: ok(),
    completeStaffOnboarding: ok(),
    correctOnboardingRelationshipClassification: ok(),
    updateOnboardingRequirement: ok(),
    authorizeOnboardingRequirementOverride: ok(),
    upsertVendorProfile: ok(),
    setVendorProfileStatus: ok(),
    requestVendorDocumentUploadAuthorization: vi.fn(async () => ({ ok: true as const, signedUrl: "u", token: "t", path: "p" })),
    recordVendorDocument: ok(),
    reviewVendorDocument: ok(),
    annotateVendorDocument: ok(),
    createPayeeProfile: ok(),
    createVendorFrameworkDraftAgreement: vi.fn(async () => ({ ok: true as const, agreementId: "a", agreementReference: "r" })),
    createVendorWorkOrderDraftAgreement: vi.fn(async () => ({ ok: true as const, agreementId: "a", agreementReference: "r" })),
    createVendorWorkOrderVariation: ok(),
    transitionAgreementStatus: ok(),
    approveAgreementAmendment: ok(),
    issueVendorFrameworkAgreement: ok(),
    issueVendorWorkOrder: ok(),
    sendVendorAgreementNotification: vi.fn(async () => undefined),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: spies.revalidatePath }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: spies.getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }));
vi.mock("@/lib/organization/onboarding", () => ({
  canManageOnboarding: spies.canManageOnboarding,
  startExternalWorkforceOnboarding: spies.startExternalWorkforceOnboarding,
  advanceOnboardingStage: spies.advanceOnboardingStage,
  completeStaffOnboarding: spies.completeStaffOnboarding,
  correctOnboardingRelationshipClassification: spies.correctOnboardingRelationshipClassification,
}));
vi.mock("@/lib/organization/onboardingRequirements", () => ({
  updateOnboardingRequirement: spies.updateOnboardingRequirement,
  authorizeOnboardingRequirementOverride: spies.authorizeOnboardingRequirementOverride,
}));
vi.mock("@/lib/vendors/vendorProfiles", () => ({ upsertVendorProfile: spies.upsertVendorProfile, setVendorProfileStatus: spies.setVendorProfileStatus }));
vi.mock("@/lib/vendors/vendorDocuments", () => ({
  requestVendorDocumentUploadAuthorization: spies.requestVendorDocumentUploadAuthorization,
  recordVendorDocument: spies.recordVendorDocument,
  reviewVendorDocument: spies.reviewVendorDocument,
  annotateVendorDocument: spies.annotateVendorDocument,
}));
vi.mock("@/lib/payables/payeeProfiles", () => ({ createPayeeProfile: spies.createPayeeProfile }));
vi.mock("@/lib/legal/vendorAgreements", () => ({
  createVendorFrameworkDraftAgreement: spies.createVendorFrameworkDraftAgreement,
  createVendorWorkOrderDraftAgreement: spies.createVendorWorkOrderDraftAgreement,
  createVendorWorkOrderVariation: spies.createVendorWorkOrderVariation,
}));
vi.mock("@/lib/legal/agreementEngine", () => ({
  transitionAgreementStatus: spies.transitionAgreementStatus,
  approveAgreementAmendment: spies.approveAgreementAmendment,
}));
vi.mock("@/lib/legal/vendorAgreementIssuance", () => ({ issueVendorFrameworkAgreement: spies.issueVendorFrameworkAgreement }));
vi.mock("@/lib/legal/vendorWorkOrderIssuance", () => ({ issueVendorWorkOrder: spies.issueVendorWorkOrder }));
vi.mock("@/lib/notifications/vendorAgreementNotification", () => ({ sendVendorAgreementNotification: spies.sendVendorAgreementNotification }));

import * as actions from "./actions";

type Result = { ok: boolean; error?: string };
type Invocation = { name: string; call: (v: Ids) => Promise<Result | null>; reaches: () => ReturnType<typeof vi.fn> };
type Ids = { vendorId: string; onboardingId: string; agreementId: string; amendmentId: string; documentId: string };

async function run(inv: Invocation, ids: Ids): Promise<Result> {
  const result = await inv.call(ids);
  if (!result) throw new Error(`${inv.name} returned no result`);
  return result;
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

// One entry per exported action. `reaches` is the underlying function that
// action calls once it is allowed to proceed (used by the positive control).
const invocations: Invocation[] = [
  { name: "recordVendorCompanyProfileAction", call: (i) => actions.recordVendorCompanyProfileAction(null, form({ vendorId: i.vendorId, companyName: "Acme" })), reaches: () => spies.upsertVendorProfile },
  { name: "startVendorOnboardingAction", call: (i) => actions.startVendorOnboardingAction(null, form({ vendorId: i.vendorId })), reaches: () => spies.startExternalWorkforceOnboarding },
  { name: "correctVendorOnboardingClassificationAction", call: (i) => actions.correctVendorOnboardingClassificationAction(null, form({ vendorId: i.vendorId, onboardingId: i.onboardingId, reason: "r" })), reaches: () => spies.correctOnboardingRelationshipClassification },
  { name: "advanceVendorOnboardingStageAction", call: (i) => actions.advanceVendorOnboardingStageAction(null, form({ vendorId: i.vendorId, onboardingId: i.onboardingId, toStage: "approved" })), reaches: () => spies.advanceOnboardingStage },
  { name: "completeVendorOnboardingAction", call: (i) => actions.completeVendorOnboardingAction(null, form({ vendorId: i.vendorId, onboardingId: i.onboardingId })), reaches: () => spies.completeStaffOnboarding },
  { name: "updateVendorRequirementAction", call: (i) => actions.updateVendorRequirementAction(null, form({ vendorId: i.vendorId, onboardingId: i.onboardingId, pipeline: "external_contractor", requirementKey: "k", status: "waived" })), reaches: () => spies.updateOnboardingRequirement },
  { name: "deferVendorRequirementAction", call: (i) => actions.deferVendorRequirementAction(null, form({ vendorId: i.vendorId, onboardingId: i.onboardingId, pipeline: "external_contractor", requirementKey: "k", reason: "r" })), reaches: () => spies.authorizeOnboardingRequirementOverride },
  { name: "requestVendorDocumentUploadAuthorizationAction", call: (i) => actions.requestVendorDocumentUploadAuthorizationAction({ vendorId: i.vendorId, originalFilename: "f.pdf" }), reaches: () => spies.requestVendorDocumentUploadAuthorization },
  { name: "recordVendorDocumentUploadAction", call: (i) => actions.recordVendorDocumentUploadAction({ vendorId: i.vendorId, storagePath: "p", documentType: "t" }), reaches: () => spies.recordVendorDocument },
  { name: "reviewVendorDocumentAction", call: (i) => actions.reviewVendorDocumentAction(null, form({ vendorId: i.vendorId, documentId: i.documentId, status: "approved" })), reaches: () => spies.reviewVendorDocument },
  { name: "annotateVendorDocumentAction", call: (i) => actions.annotateVendorDocumentAction(null, form({ vendorId: i.vendorId, documentId: i.documentId, notes: "n" })), reaches: () => spies.annotateVendorDocument },
  { name: "setVendorStatusAction", call: (i) => actions.setVendorStatusAction(null, form({ vendorId: i.vendorId, status: "active" })), reaches: () => spies.setVendorProfileStatus },
  { name: "createVendorPayeeProfileAction", call: (i) => actions.createVendorPayeeProfileAction(null, form({ vendorId: i.vendorId, companyName: "Acme" })), reaches: () => spies.createPayeeProfile },
  { name: "createVendorFrameworkAction", call: (i) => actions.createVendorFrameworkAction(null, form({ vendorId: i.vendorId })), reaches: () => spies.createVendorFrameworkDraftAgreement },
  { name: "approveVendorFrameworkForIssueAction", call: (i) => actions.approveVendorFrameworkForIssueAction(null, form({ vendorId: i.vendorId, agreementId: i.agreementId })), reaches: () => spies.transitionAgreementStatus },
  { name: "issueVendorFrameworkAction", call: (i) => actions.issueVendorFrameworkAction(null, form({ vendorId: i.vendorId, agreementId: i.agreementId })), reaches: () => spies.issueVendorFrameworkAgreement },
  { name: "createVendorWorkOrderAction", call: (i) => actions.createVendorWorkOrderAction(null, form({ vendorId: i.vendorId, frameworkAgreementId: i.agreementId })), reaches: () => spies.createVendorWorkOrderDraftAgreement },
  { name: "approveVendorWorkOrderForIssueAction", call: (i) => actions.approveVendorWorkOrderForIssueAction(null, form({ vendorId: i.vendorId, agreementId: i.agreementId })), reaches: () => spies.transitionAgreementStatus },
  { name: "issueVendorWorkOrderAction", call: (i) => actions.issueVendorWorkOrderAction(null, form({ vendorId: i.vendorId, agreementId: i.agreementId })), reaches: () => spies.issueVendorWorkOrder },
  { name: "createVendorWorkOrderVariationAction", call: (i) => actions.createVendorWorkOrderVariationAction(null, form({ vendorId: i.vendorId, workOrderAgreementId: i.agreementId, reason: "r" })), reaches: () => spies.createVendorWorkOrderVariation },
  { name: "approveVendorWorkOrderVariationAction", call: (i) => actions.approveVendorWorkOrderVariationAction(null, form({ vendorId: i.vendorId, amendmentId: i.amendmentId })), reaches: () => spies.approveAgreementAmendment },
];

const vendorIds: Ids = { vendorId: VENDOR, onboardingId: "ob-vendor", agreementId: "ag-vendor", amendmentId: "am-vendor", documentId: "doc-vendor" };
const idsFor = (vendorId: string): Ids => ({ ...vendorIds, vendorId });

const allSpies = () => Object.entries(spies).filter(([name]) => !["canManageOnboarding", "getCurrentUser", "revalidatePath"].includes(name)).map(([, fn]) => fn as ReturnType<typeof vi.fn>);

beforeEach(() => {
  fake.ops.length = 0;
  for (const fn of Object.values(spies)) (fn as ReturnType<typeof vi.fn>).mockClear();
  spies.canManageOnboarding.mockImplementation(async () => true);
});

describe("vendor action inventory", () => {
  it("covers every exported server action — a new vendor action cannot be added without a guard test", () => {
    const exported = Object.keys(actions).filter((k) => typeof (actions as Record<string, unknown>)[k] === "function").sort();
    expect(exported).toEqual(invocations.map((i) => i.name).sort());
    expect(exported).toHaveLength(21);
  });
});

describe("negative: individual contributors / non-vendors cannot invoke ANY vendor-only action", () => {
  const refused: [string, string, string][] = [
    ["Workshop Instructor (instructor + contractor role)", INSTRUCTOR, VENDOR_NOT_ELIGIBLE_MESSAGE],
    ["contractor operating through a registered business (independent_contractor + contractor role)", CONTRACTOR_BUSINESS, VENDOR_NOT_ELIGIBLE_MESSAGE],
    ["model (model_talent + model role)", MODEL, VENDOR_NOT_ELIGIBLE_MESSAGE],
    ["conflicting classification (vendor_supplier type + contractor role)", CONFLICT, VENDOR_CONFLICT_MESSAGE],
  ];
  for (const [label, profileId, message] of refused) {
    describe(label, () => {
      for (const inv of invocations) {
        it(`${inv.name} is refused with no side effect`, async () => {
          const result = await run(inv, idsFor(profileId));
          expect(result.ok).toBe(false);
          expect(result.error).toBe(message);
          for (const spy of allSpies()) expect(spy).not.toHaveBeenCalled();
          expect(fake.ops).toEqual([]);
        });
      }
    });
  }
});

describe("negative: an unknown or empty vendor id is refused", () => {
  it.each(invocations.map((i) => [i.name, i] as const))("%s", async (_name, inv) => {
    for (const vendorId of ["does-not-exist", ""]) {
      const result = await run(inv, idsFor(vendorId));
      expect(result.ok).toBe(false);
      for (const spy of allSpies()) expect(spy).not.toHaveBeenCalled();
      expect(fake.ops).toEqual([]);
    }
  });
});

describe("authorization boundary is unchanged: an unauthorized caller gets the pre-existing generic refusal", () => {
  it.each(invocations.filter((i) => i.name !== "createVendorPayeeProfileAction").map((i) => [i.name, i] as const))("%s", async (_name, inv) => {
    spies.canManageOnboarding.mockImplementation(async () => false);
    const result = await run(inv, vendorIds);
    expect(result).toEqual({ ok: false, error: "You are not authorized to do this." });
    for (const spy of allSpies()) expect(spy).not.toHaveBeenCalled();
  });
});

describe("regression: a genuine vendor still gets through to every action", () => {
  it.each(invocations.map((i) => [i.name, i] as const))("%s reaches its underlying operation for a clean vendor", async (_name, inv) => {
    const result = await run(inv, vendorIds);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(inv.reaches()).toHaveBeenCalled();
  });
  it("a vendor with the Vendor role and no engagement type yet (the startVendorOnboardingAction entry point) is accepted", async () => {
    const result = await actions.startVendorOnboardingAction(null, form({ vendorId: VENDOR_NO_TYPE }));
    expect(result?.ok).toBe(true);
    expect(spies.startExternalWorkforceOnboarding).toHaveBeenCalledTimes(1);
  });
});

describe("negative: an eligible vendor id cannot be paired with someone else's record", () => {
  const foreign: Ids = { vendorId: VENDOR, onboardingId: "ob-instructor", agreementId: "ag-instructor", amendmentId: "am-instructor", documentId: "doc-instructor" };
  const idBearing = ["correctVendorOnboardingClassificationAction", "advanceVendorOnboardingStageAction", "completeVendorOnboardingAction", "updateVendorRequirementAction", "deferVendorRequirementAction", "reviewVendorDocumentAction", "annotateVendorDocumentAction", "approveVendorFrameworkForIssueAction", "issueVendorFrameworkAction", "createVendorWorkOrderAction", "approveVendorWorkOrderForIssueAction", "issueVendorWorkOrderAction", "createVendorWorkOrderVariationAction", "approveVendorWorkOrderVariationAction"];
  it.each(invocations.filter((i) => idBearing.includes(i.name)).map((i) => [i.name, i] as const))("%s", async (_name, inv) => {
    const result = await run(inv, foreign);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not belong to this vendor/);
    for (const spy of allSpies()) expect(spy).not.toHaveBeenCalled();
    expect(fake.ops).toEqual([]);
  });
});

describe("the vendor-classified payee boundary specifically", () => {
  it("creating a vendor payee profile for an instructor never reaches Finance's createPayeeProfile", async () => {
    const result = await actions.createVendorPayeeProfileAction(null, form({ vendorId: INSTRUCTOR, companyName: "" }));
    expect(result?.ok).toBe(false);
    expect(spies.createPayeeProfile).not.toHaveBeenCalled();
  });
  it("creating a vendor profile or a vendor framework agreement for an instructor is refused before any library call", async () => {
    await actions.recordVendorCompanyProfileAction(null, form({ vendorId: INSTRUCTOR, companyName: "Kwaku Co" }));
    await actions.createVendorFrameworkAction(null, form({ vendorId: INSTRUCTOR }));
    expect(spies.upsertVendorProfile).not.toHaveBeenCalled();
    expect(spies.createVendorFrameworkDraftAgreement).not.toHaveBeenCalled();
    expect(spies.sendVendorAgreementNotification).not.toHaveBeenCalled();
  });
});
