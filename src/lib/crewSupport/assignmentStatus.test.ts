import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeAssignment, groupAssignments } from "./assignmentStatus";
import { DELIVERY_ADVANCING_CATEGORY_KEYS, shouldAdvanceToDelivered } from "@/lib/admin/deliverableStage";

const job = (over: Record<string, unknown> = {}) => ({ state: "accepted" as const, startDate: "2026-10-12", endDate: "2026-10-12", jobClosed: false, ...over });

describe("My Assignments grouping and next action", () => {
  it("an open offer asks for a response; a closed one does not", () => {
    expect(describeAssignment(job({ state: "offered" }), "2026-10-11")).toMatchObject({ group: "offer", nextAction: expect.stringMatching(/accept or decline/) });
    expect(describeAssignment(job({ state: "offered", jobClosed: true }), "2026-10-11").group).toBe("closed");
  });
  it("an accepted job moves through upcoming → job day → date passed, and stays active until the request closes", () => {
    expect(describeAssignment(job(), "2026-10-11")).toMatchObject({ group: "active", status: "Accepted — upcoming" });
    expect(describeAssignment(job(), "2026-10-12")).toMatchObject({ group: "active", status: "Accepted — job day" });
    expect(describeAssignment(job(), "2026-10-20")).toMatchObject({ group: "active", status: "Accepted — job date passed" });
    expect(describeAssignment(job({ jobClosed: true }), "2026-10-20").group).toBe("closed");
  });
  it("declined jobs are closed", () => expect(describeAssignment(job({ state: "declined" }), "2026-10-11").group).toBe("closed"));
  it("groups a mixed list", () => {
    const g = groupAssignments([job({ state: "offered" }), job(), job({ jobClosed: true }), job({ state: "declined" })], "2026-10-11");
    expect([g.offers.length, g.active.length, g.closed.length]).toEqual([1, 1, 2]);
  });
});

describe("a published deliverable may only advance a non-Crew-Support enquiry, and only for a final-output category", () => {
  it("never for a Creative Crew Support job, whatever the category (Bright's thank-you images must not mark the project delivered)", () => {
    for (const k of DELIVERY_ADVANCING_CATEGORY_KEYS) expect(shouldAdvanceToDelivered({ entityType: "enquiry", categoryKey: k, isCrewSupportEnquiry: true })).toBe(false);
  });
  it("not for non-output categories (contracts, invoices, call sheets, mood boards) or unknown/preview keys", () => {
    for (const k of ["contracts", "invoices", "receipts", "call-sheets", "mood-boards", "certificates", "workshop-materials", "other-deliverables", "sneak-peek", "thank-you-images", "design-draft", null])
      expect(shouldAdvanceToDelivered({ entityType: "enquiry", categoryKey: k, isCrewSupportEnquiry: false })).toBe(false);
  });
  it("still advances for the final outputs on an ordinary enquiry, never for workshop registrations", () => {
    expect(shouldAdvanceToDelivered({ entityType: "enquiry", categoryKey: "final-videos", isCrewSupportEnquiry: false })).toBe(true);
    expect(shouldAdvanceToDelivered({ entityType: "workshop_registration", categoryKey: "final-videos", isCrewSupportEnquiry: false })).toBe(false);
  });
  it("the publish action consults the rule and only touches crm_stage inside it; the Files Ready email is unchanged", () => {
    const src = readFileSync("src/app/admin/deliverables/actions.ts", "utf8");
    expect(src).toContain("shouldAdvanceToDelivered(");
    expect(src).toContain("if (advanceStage)");
    expect(src).toContain("sendFilesReadyEmail(");
  });
});

describe("navigation wiring", () => {
  it("the portal header and Admin My Workspace both say My Assignments and share one list component", () => {
    expect(readFileSync("src/app/portal/(dashboard)/layout.tsx", "utf8")).toContain('label: "My Assignments"');
    expect(readFileSync("src/app/admin/me/assignments/page.tsx", "utf8")).toContain("MyAssignmentsList");
    expect(readFileSync("src/app/portal/(dashboard)/crew-offers/page.tsx", "utf8")).toContain("MyAssignmentsList");
  });
  it("assignments are resolved from the signed-in user's own id — never a role", () => {
    const admin = readFileSync("src/app/admin/me/assignments/page.tsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(admin).toContain("listMyCrewJobs(user.id)");
    expect(admin).not.toMatch(/isSuperAdmin|hasRole/);
  });
});
