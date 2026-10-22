import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, executed: false }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: true, actedAsOverride: false }), PEOPLE_CAPABILITIES: { workshopEngagementAdminister: "x" }, OPERATIONS_CAPABILITIES: { workshopAdminister: "x" } }));
vi.mock("@/lib/content/sanity/workshopAdmin", () => ({ getWorkshopByIdAdmin: async () => null }));
vi.mock("@/lib/legal/agreementEngine", () => ({ hasFullyExecutedAgreement: async () => h.executed }));

import { createInstructorEngagement } from "./instructorEngagements";
import { createWorkshopSession } from "./sessions";

beforeEach(() => {
  h.executed = false;
  h.db = makeFakeDb({
    staff_details: [{ id: "kwaku", engagement_type_id: "tI" }, { id: "staff", engagement_type_id: "tE" }],
    engagement_types: [{ id: "tI", slug: "instructor" }, { id: "tE", slug: "employee" }],
    workshop_instructor_engagements: [],
    workshop_sessions: [],
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
  it("the same rule applies when an instructor is put on a workshop SESSION", async () => {
    const base = { workshopId: "w1", sessionDate: "2026-11-02", startTime: "10:00", title: "Intro", actorUserId: "f" };
    const refused = await createWorkshopSession({ ...base, instructorProfileId: "kwaku" });
    expect(!refused.ok && refused.error).toContain("not fully executed");
    expect(h.db.tables.workshop_sessions).toEqual([]);
    h.executed = true;
    expect((await createWorkshopSession({ ...base, instructorProfileId: "kwaku" })).ok).toBe(true);
    h.executed = false;
    expect((await createWorkshopSession({ ...base, instructorProfileId: "staff" })).ok).toBe(true);
    expect((await createWorkshopSession({ ...base })).ok).toBe(true);
  });
});
