import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeAdmin, type FakeTables } from "./__testsupport__/fakeAdmin";

// Library-level (defence in depth) tests for the contributor/vendor
// boundary: the Vendor workspace actions are guarded, but the functions that
// actually create vendor profiles, vendor-classified payees and vendor
// agreements must hold the same line when called from anywhere else — e.g.
// the generic Payables → Payees form.

const INSTRUCTOR = "instructor-profile";
const FREELANCER = "freelancer-profile";
const CONFLICT = "conflict-profile";
const VENDOR = "vendor-profile";
const UNCLASSIFIED = "unclassified-profile";

const tables: FakeTables = {
  profiles: [{ id: INSTRUCTOR }, { id: FREELANCER }, { id: CONFLICT }, { id: VENDOR }, { id: UNCLASSIFIED }],
  user_roles: [
    { user_id: INSTRUCTOR, roles: { slug: "contractor" } },
    { user_id: FREELANCER, roles: { slug: "contractor" } },
    { user_id: CONFLICT, roles: { slug: "vendor" } },
    { user_id: VENDOR, roles: { slug: "vendor" } },
    { user_id: UNCLASSIFIED, roles: { slug: "client" } },
  ],
  staff_details: [
    { id: INSTRUCTOR, engagement_types: { slug: "instructor" } },
    { id: FREELANCER, engagement_types: { slug: "freelancer" } },
    { id: CONFLICT, engagement_types: { slug: "instructor" } },
    { id: VENDOR, engagement_types: { slug: "vendor_supplier" } },
  ],
  staff_onboarding: [],
};
const fake = makeFakeAdmin(tables);

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(async () => ({ ok: true as const, actedAsOverride: true })),
  logActivity: vi.fn(async () => undefined),
  canManageOnboarding: vi.fn(async () => true),
  createDraftAgreement: vi.fn(async () => ({ ok: true as const, agreementId: "a1", agreementReference: "ORD-AGR-1" })),
  addAgreementParty: vi.fn(async () => ({ ok: true as const, partyId: "p" })),
  attachAgreementSnapshot: vi.fn(async () => ({ ok: true as const })),
  checkVendorAgreementJurisdiction: vi.fn(async () => ({ ok: true as const, jurisdiction: "GH" })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: mocks.logActivity }));
vi.mock("@/lib/organization/authority", () => ({
  isSuperAdminId: vi.fn(async () => true),
  authorizeWithSuperAdminOverride: mocks.authorize,
  FINANCE_CAPABILITIES: { payeeAdminister: "finance.payee.administer" },
}));
vi.mock("@/lib/organization/onboarding", () => ({ canManageOnboarding: mocks.canManageOnboarding }));
vi.mock("@/lib/legal/agreementEngine", () => ({
  createDraftAgreement: mocks.createDraftAgreement,
  addAgreementParty: mocks.addAgreementParty,
  attachAgreementSnapshot: mocks.attachAgreementSnapshot,
  createAgreementAmendment: vi.fn(),
  listAgreementAmendments: vi.fn(),
}));
vi.mock("@/lib/legal/vendorAgreementJurisdictionGate", () => ({ checkVendorAgreementJurisdiction: mocks.checkVendorAgreementJurisdiction }));

import { createPayeeProfile } from "@/lib/payables/payeeProfiles";
import { upsertVendorProfile } from "@/lib/vendors/vendorProfiles";
import { createVendorFrameworkDraftAgreement, createVendorWorkOrderDraftAgreement } from "@/lib/legal/vendorAgreements";

const payeeInserts = () => fake.ops.filter((o) => o.table === "payee_profiles" && o.kind === "insert");

beforeEach(() => {
  fake.ops.length = 0;
  mocks.authorize.mockClear();
  mocks.authorize.mockImplementation(async () => ({ ok: true as const, actedAsOverride: true }));
  mocks.logActivity.mockClear();
  mocks.canManageOnboarding.mockClear();
  mocks.createDraftAgreement.mockClear();
  mocks.addAgreementParty.mockClear();
});

describe("createPayeeProfile — no vendor payee category for contributors", () => {
  it("refuses category 'vendor' for a Workshop Instructor and writes nothing", async () => {
    const result = await createPayeeProfile({ profileId: INSTRUCTOR, category: "vendor", actorUserId: "admin" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/cannot be assigned to an individual contributor/);
    expect(payeeInserts()).toEqual([]);
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
  it("refuses category 'vendor' for a freelancer and for a conflicting classification", async () => {
    expect((await createPayeeProfile({ profileId: FREELANCER, category: "vendor", actorUserId: "admin" })).ok).toBe(false);
    const conflict = await createPayeeProfile({ profileId: CONFLICT, category: "vendor", actorUserId: "admin" });
    expect(conflict.ok).toBe(false);
    expect(!conflict.ok && conflict.error).toMatch(/conflicting vendor and contractor classifications/);
    expect(payeeInserts()).toEqual([]);
  });
  it("still allows the correct category for an instructor (Finance controls unchanged)", async () => {
    const result = await createPayeeProfile({ profileId: INSTRUCTOR, category: "instructor", actorUserId: "admin" });
    expect(result.ok).toBe(true);
    expect(payeeInserts()).toHaveLength(1);
    expect(mocks.authorize).toHaveBeenCalledWith("admin", "finance.payee.administer");
  });
  it("still allows category 'vendor' for a genuine vendor", async () => {
    expect((await createPayeeProfile({ profileId: VENDOR, category: "vendor", actorUserId: "admin" })).ok).toBe(true);
    expect(payeeInserts()).toHaveLength(1);
  });
  it("does not block Finance from classifying an account with no contributor signal as a vendor payee (existing behaviour preserved)", async () => {
    expect((await createPayeeProfile({ profileId: UNCLASSIFIED, category: "vendor", actorUserId: "admin" })).ok).toBe(true);
  });
  it("Finance authorization is checked FIRST: an unauthorized caller learns nothing about classification", async () => {
    mocks.authorize.mockImplementation(async () => ({ ok: false as never, actedAsOverride: false }));
    const result = await createPayeeProfile({ profileId: INSTRUCTOR, category: "vendor", actorUserId: "intruder" });
    expect(result).toEqual({ ok: false, error: "Not authorized to administer payees." });
    expect(payeeInserts()).toEqual([]);
  });
});

describe("upsertVendorProfile — no vendor profile for an individual contributor", () => {
  it("refuses an instructor and writes no vendor_profiles row", async () => {
    const result = await upsertVendorProfile({ profileId: INSTRUCTOR, companyName: "Kwaku Studios", actorUserId: "admin" });
    expect(result.ok).toBe(false);
    expect(fake.ops.filter((o) => o.table === "vendor_profiles")).toEqual([]);
  });
  it("accepts a genuine vendor", async () => {
    const result = await upsertVendorProfile({ profileId: VENDOR, companyName: "Acme Supplies", actorUserId: "admin" });
    expect(result.ok).toBe(true);
    expect(fake.ops.filter((o) => o.table === "vendor_profiles" && o.kind === "upsert")).toHaveLength(1);
  });
  it("keeps the onboarding-authority check first", async () => {
    mocks.canManageOnboarding.mockImplementationOnce(async () => false);
    const result = await upsertVendorProfile({ profileId: VENDOR, companyName: "Acme", actorUserId: "intruder" });
    expect(result).toEqual({ ok: false, error: "Not authorized to record vendor profile details." });
  });
});

describe("vendor agreements (OS-LGL-009A/B) are never drafted for a non-vendor", () => {
  it("createVendorFrameworkDraftAgreement refuses an instructor before any jurisdiction lookup or draft", async () => {
    const result = await createVendorFrameworkDraftAgreement({ vendorProfileId: INSTRUCTOR, actorUserId: "admin" });
    expect(result.ok).toBe(false);
    expect(mocks.checkVendorAgreementJurisdiction).not.toHaveBeenCalled();
    expect(mocks.createDraftAgreement).not.toHaveBeenCalled();
    expect(mocks.addAgreementParty).not.toHaveBeenCalled();
  });
  it("createVendorWorkOrderDraftAgreement refuses an instructor before reading any framework", async () => {
    const result = await createVendorWorkOrderDraftAgreement({ frameworkAgreementId: "f", vendorProfileId: INSTRUCTOR, actorUserId: "admin" });
    expect(result.ok).toBe(false);
    expect(mocks.createDraftAgreement).not.toHaveBeenCalled();
  });
  it("a conflicting classification is refused too", async () => {
    expect((await createVendorFrameworkDraftAgreement({ vendorProfileId: CONFLICT, actorUserId: "admin" })).ok).toBe(false);
    expect(mocks.createDraftAgreement).not.toHaveBeenCalled();
  });
});
