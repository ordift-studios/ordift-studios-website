import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, executed: false }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: true, actedAsOverride: false }), PEOPLE_CAPABILITIES: { workshopEngagementAdminister: "x" } }));
vi.mock("@/lib/content/sanity/workshopAdmin", () => ({ getWorkshopByIdAdmin: async () => null }));
vi.mock("@/lib/legal/agreementEngine", () => ({ hasFullyExecutedAgreement: async () => h.executed }));

import { createInstructorEngagement } from "./instructorEngagements";

beforeEach(() => {
  h.executed = false;
  h.db = makeFakeDb({
    profiles: [{ id: "kwaku", engagement_type_id: "tI" }, { id: "staff", engagement_type_id: "tE" }],
    engagement_types: [{ id: "tI", slug: "instructor" }, { id: "tE", slug: "employee" }],
    workshop_instructor_engagements: [],
  });
});

describe("a real workshop assignment needs an executed agreement for instructors", () => {
  it("refuses an instructor whose OS-LGL-010 is not fully executed, and creates nothing", async () => {
    const r = await createInstructorEngagement({ workshopId: "w1", profileId: "kwaku", actorUserId: "f" });
    expect(!r.ok && r.error).toContain("not fully executed");
    expect(h.db.tables.workshop_instructor_engagements).toEqual([]);
  });
  it("allows the instructor once the agreement is genuinely executed", async () => {
    h.executed = true;
    expect((await createInstructorEngagement({ workshopId: "w1", profileId: "kwaku", actorUserId: "f" })).ok).toBe(true);
  });
  it("does not change anything for people of other engagement types or external payee names", async () => {
    expect((await createInstructorEngagement({ workshopId: "w1", profileId: "staff", actorUserId: "f" })).ok).toBe(true);
    expect((await createInstructorEngagement({ workshopId: "w2", externalPayeeName: "Guest Speaker", actorUserId: "f" })).ok).toBe(true);
  });
});
