import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeAdmin, type FakeTables } from "./__testsupport__/fakeAdmin";

// Vendor-document write paths (Founder instruction 2026-10-21, item A):
// ownership of the row is NOT enough. Recording, authorizing the upload of,
// reviewing and annotating vendor documents — and changing a vendor profile's
// status — all require the target account to resolve as a clean vendor. A
// contributor, an employee, an unclassified account and a conflicting
// classification are refused before anything is written, whoever the actor.

const INSTRUCTOR = "instructor-profile";
const FREELANCER = "freelancer-profile";
const CONTRACTOR_BIZ = "contractor-business-profile";
const CONFLICT = "conflict-profile";
const EMPLOYEE = "employee-profile";
const UNCLASSIFIED = "unclassified-profile";
const VENDOR = "vendor-profile";
const OTHER_VENDOR = "other-vendor-profile";
const ADMIN = "admin-actor";

const tables: FakeTables = {
  user_roles: [
    { user_id: INSTRUCTOR, roles: { slug: "contractor" } },
    { user_id: FREELANCER, roles: { slug: "contractor" } },
    { user_id: CONTRACTOR_BIZ, roles: { slug: "contractor" } },
    { user_id: CONFLICT, roles: { slug: "vendor" } },
    { user_id: EMPLOYEE, roles: { slug: "staff" } },
    { user_id: UNCLASSIFIED, roles: { slug: "client" } },
    { user_id: VENDOR, roles: { slug: "vendor" } },
    { user_id: OTHER_VENDOR, roles: { slug: "vendor" } },
  ],
  staff_details: [
    { id: INSTRUCTOR, engagement_types: { slug: "instructor" } },
    { id: FREELANCER, engagement_types: { slug: "freelancer" } },
    { id: CONTRACTOR_BIZ, engagement_types: { slug: "independent_contractor" } },
    { id: CONFLICT, engagement_types: { slug: "instructor" } },
    { id: EMPLOYEE, engagement_types: { slug: "full_time" } },
    { id: VENDOR, engagement_types: { slug: "vendor_supplier" } },
    { id: OTHER_VENDOR, engagement_types: { slug: "vendor_supplier" } },
  ],
  staff_onboarding: [{ profile_id: EMPLOYEE, pipeline: "employee" }],
  vendor_documents: [
    { id: "doc-instructor", vendor_profile_id: INSTRUCTOR },
    { id: "doc-freelancer", vendor_profile_id: FREELANCER },
    { id: "doc-conflict", vendor_profile_id: CONFLICT },
    { id: "doc-employee", vendor_profile_id: EMPLOYEE },
    { id: "doc-vendor", vendor_profile_id: VENDOR },
    { id: "doc-other-vendor", vendor_profile_id: OTHER_VENDOR },
  ],
};
const fake = makeFakeAdmin(tables);

const mocks = vi.hoisted(() => ({
  logActivity: vi.fn(async () => undefined),
  canManageOnboarding: vi.fn(async () => true),
  notify: vi.fn(async () => undefined),
  createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: "https://signed.example/u", token: "t", path }, error: null })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ ...fake.client, storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) } }),
}));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: mocks.logActivity }));
vi.mock("@/lib/organization/onboarding", () => ({ canManageOnboarding: mocks.canManageOnboarding }));
vi.mock("@/lib/notifications/vendorAgreementNotification", () => ({ sendVendorAgreementNotification: mocks.notify }));

import { recordVendorDocument, requestVendorDocumentUploadAuthorization, reviewVendorDocument, annotateVendorDocument } from "@/lib/vendors/vendorDocuments";
import { setVendorProfileStatus } from "@/lib/vendors/vendorProfiles";

const writes = () => fake.ops.filter((o) => o.table === "vendor_documents" || o.table === "vendor_profiles");

beforeEach(() => {
  fake.ops.length = 0;
  mocks.logActivity.mockClear();
  mocks.notify.mockClear();
  mocks.createSignedUploadUrl.mockClear();
  mocks.canManageOnboarding.mockReset();
  mocks.canManageOnboarding.mockImplementation(async () => true);
});

const NOT_ELIGIBLE: [string, string, string][] = [
  ["Workshop Instructor", INSTRUCTOR, "doc-instructor"],
  ["Freelancer", FREELANCER, "doc-freelancer"],
  ["conflicting vendor/contractor classification", CONFLICT, "doc-conflict"],
  ["employee", EMPLOYEE, "doc-employee"],
];

describe.each(NOT_ELIGIBLE)("%s — vendor-document paths are refused", (_label, profile, documentId) => {
  it("self-service upload authorization is refused and no signed URL is created", async () => {
    const result = await requestVendorDocumentUploadAuthorization({ vendorProfileId: profile, originalFilename: "cert.pdf", actorUserId: profile });
    expect(result.ok).toBe(false);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("self-service recording of a document is refused: no row, no log, no notification", async () => {
    const result = await recordVendorDocument({ vendorProfileId: profile, storagePath: `${profile}/x-cert.pdf`, documentType: "registration", actorUserId: profile });
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
    expect(mocks.logActivity).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("an administrator recording a document for that account is refused too (target decides, not actor)", async () => {
    const result = await recordVendorDocument({ vendorProfileId: profile, storagePath: `${profile}/x-cert.pdf`, documentType: "registration", actorUserId: ADMIN });
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });
  it("administrator upload authorization for that account is refused", async () => {
    const result = await requestVendorDocumentUploadAuthorization({ vendorProfileId: profile, originalFilename: "cert.pdf", actorUserId: ADMIN });
    expect(result.ok).toBe(false);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("review is refused and the document is not touched", async () => {
    const result = await reviewVendorDocument({ documentId, status: "approved", actorUserId: ADMIN });
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("annotation is refused and the document is not touched", async () => {
    const result = await annotateVendorDocument({ documentId, notes: "note", actorUserId: ADMIN });
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });
  it("changing the vendor profile status is refused and writes nothing", async () => {
    const result = await setVendorProfileStatus({ vendorProfileId: profile, status: "active", actorUserId: ADMIN });
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });
});

describe("other non-vendors", () => {
  it.each([
    ["contractor operating through a registered business", CONTRACTOR_BIZ],
    ["unclassified account", UNCLASSIFIED],
  ])("%s cannot record or authorize vendor documents", async (_label, profile) => {
    const record = await recordVendorDocument({ vendorProfileId: profile, storagePath: `${profile}/x.pdf`, documentType: "registration", actorUserId: profile });
    const auth = await requestVendorDocumentUploadAuthorization({ vendorProfileId: profile, originalFilename: "x.pdf", actorUserId: profile });
    expect(record.ok).toBe(false);
    expect(auth.ok).toBe(false);
    expect(writes()).toHaveLength(0);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("genuine vendors keep their functionality", () => {
  it("a vendor can authorize and record their own document", async () => {
    const auth = await requestVendorDocumentUploadAuthorization({ vendorProfileId: VENDOR, originalFilename: "cert.pdf", actorUserId: VENDOR });
    expect(auth.ok).toBe(true);
    const record = await recordVendorDocument({ vendorProfileId: VENDOR, storagePath: `${VENDOR}/abc-cert.pdf`, documentType: "registration", actorUserId: VENDOR });
    expect(record.ok).toBe(true);
    const insert = fake.ops.find((o) => o.table === "vendor_documents" && o.kind === "insert");
    expect(insert?.payload).toMatchObject({ vendor_profile_id: VENDOR, uploaded_by: VENDOR, document_type: "registration" });
  });
  it("an administrator can record, review and annotate a genuine vendor's document and set the vendor status", async () => {
    expect((await recordVendorDocument({ vendorProfileId: VENDOR, storagePath: `${VENDOR}/abc-cert.pdf`, documentType: "tax", actorUserId: ADMIN })).ok).toBe(true);
    expect((await reviewVendorDocument({ documentId: "doc-vendor", status: "approved", actorUserId: ADMIN })).ok).toBe(true);
    expect((await annotateVendorDocument({ documentId: "doc-vendor", notes: "reviewed offline", actorUserId: ADMIN })).ok).toBe(true);
    expect((await setVendorProfileStatus({ vendorProfileId: VENDOR, status: "active", actorUserId: ADMIN })).ok).toBe(true);
    expect(fake.ops.map((o) => `${o.table}:${o.kind}`)).toEqual(["vendor_documents:insert", "vendor_documents:update", "vendor_documents:update", "vendor_profiles:update"]);
  });
  it("existing authorization is unchanged: a non-admin acting on someone else's vendor account is still refused", async () => {
    mocks.canManageOnboarding.mockImplementation(async () => false);
    const result = await recordVendorDocument({ vendorProfileId: VENDOR, storagePath: `${VENDOR}/abc-cert.pdf`, documentType: "tax", actorUserId: "random-user" });
    expect(result).toEqual({ ok: false, error: "Not authorized to upload a document for this vendor." });
    expect(writes()).toHaveLength(0);
  });
});

describe("superseding a document stays inside the same vendor", () => {
  it("refuses to supersede another vendor's document", async () => {
    const result = await recordVendorDocument({ vendorProfileId: VENDOR, storagePath: `${VENDOR}/abc-v2.pdf`, documentType: "tax", supersedesId: "doc-other-vendor", actorUserId: VENDOR });
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });
  it("refuses a supersedes id that does not exist", async () => {
    const result = await recordVendorDocument({ vendorProfileId: VENDOR, storagePath: `${VENDOR}/abc-v2.pdf`, documentType: "tax", supersedesId: "missing", actorUserId: VENDOR });
    expect(result.ok).toBe(false);
  });
  it("allows superseding the vendor's own document", async () => {
    const result = await recordVendorDocument({ vendorProfileId: VENDOR, storagePath: `${VENDOR}/abc-v2.pdf`, documentType: "tax", supersedesId: "doc-vendor", actorUserId: VENDOR });
    expect(result.ok).toBe(true);
  });
});

// Source pin (defence in depth): the only code allowed to write vendor_documents
// is vendorDocuments.ts, and every write there sits behind the shared guard.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !/e2e\.ts$/.test(name) && !full.includes("__testsupport__")) out.push(full);
  }
  return out;
}

describe("vendor_documents write surface", () => {
  const root = join(process.cwd(), "src");
  const writers = sourceFiles(root).filter((file) => {
    const text = readFileSync(file, "utf8");
    return /from\("vendor_documents"\)[\s\S]{0,80}\.(insert|update|upsert|delete)\(/.test(text);
  });
  it("only src/lib/vendors/vendorDocuments.ts writes the table", () => {
    expect(writers.map((w) => w.replace(root, "src"))).toEqual(["src/lib/vendors/vendorDocuments.ts"]);
  });
  it("every write function in it consults the shared eligibility refusal first", () => {
    const text = readFileSync(join(root, "lib/vendors/vendorDocuments.ts"), "utf8");
    for (const fn of ["requestVendorDocumentUploadAuthorization", "recordVendorDocument", "reviewVendorDocument", "annotateVendorDocument"]) {
      const body = text.slice(text.indexOf(`export async function ${fn}(`)).split(/\nexport (async )?function /)[0];
      expect(body, fn).toMatch(/await vendorEligibilityRefusal\(/);
      expect(body.indexOf("vendorEligibilityRefusal("), fn).toBeLessThan(Math.max(body.indexOf('.insert('), body.indexOf('.update('), body.indexOf("createSignedUploadUrl")));
    }
  });
  it("the vendor portal self-service actions never touch the table directly", () => {
    const text = readFileSync(join(root, "app/portal/(dashboard)/vendor/actions.ts"), "utf8");
    expect(text).not.toMatch(/createAdminClient|from\("vendor_documents"\)/);
  });
});
