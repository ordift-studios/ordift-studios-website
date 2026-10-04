import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { crewSupportSchema, pickServiceDetails } from "./schema";
import { submitCrewSupportRequest, type CrewSupportDeps } from "./submit";
import { buildCrewSupportAcknowledgementEmail, buildCrewSupportAdminNotificationEmail } from "./emails";
import { allowedStatusTransitions, SERVICE_FAMILIES, SUBMITTED_MESSAGE, detailQuestionsFor } from "./config";
import { canConfirm, validateSlotChange, validateStatusChange } from "./rules";
import { canManageCrewSupport } from "./permissions";
import { getCachedResult, storeResult } from "@/lib/shared/idempotency";

const TITLE_ID = "11111111-1111-4111-8111-111111111111";
const TITLE_ID_2 = "22222222-2222-4222-8222-222222222222";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    requesterType: "photographer",
    fullName: "Ama Mensah",
    email: "ama@example.com",
    phone: "+233241234567",
    serviceFamily: "photography",
    projectName: "Mensah–Owusu wedding",
    startDate: "2099-10-10",
    endDate: "2099-10-10",
    location: "Accra",
    requirements: [{ titleId: TITLE_ID, quantity: 1 }],
    consent: true,
    ...overrides,
  };
}

function deps(overrides: Partial<CrewSupportDeps> = {}): CrewSupportDeps & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({ ok: true, requestId: "req-1" });
  return {
    generateReference: async () => "CSR-2099-000001",
    findUserId: async () => null,
    resolveTitleLabels: async (ids) => Object.fromEntries(ids.map((id) => [id, id === TITLE_ID ? "Photographer" : "Videographer"])),
    create,
    now: () => new Date("2099-01-01T00:00:00Z"),
    ...overrides,
  } as CrewSupportDeps & { create: ReturnType<typeof vi.fn> };
}

describe("Creative Crew Support submission", () => {
  it("accepts a valid single-role request and returns a pending-review message with a reference", async () => {
    const d = deps();
    const result = await submitCrewSupportRequest(valid(), d);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.referenceNumber).toBe("CSR-2099-000001");
    expect(result.message).toBe(SUBMITTED_MESSAGE);
    expect(d.create).toHaveBeenCalledTimes(1);
    const [request, requirements] = d.create.mock.calls[0];
    expect(request.service_family).toBe("photography");
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({ role_label: "Photographer", quantity: 1 });
  });

  it("accepts several crew requirements in ONE request", async () => {
    const d = deps();
    const result = await submitCrewSupportRequest(
      valid({ requirements: [{ titleId: TITLE_ID, quantity: 2 }, { titleId: TITLE_ID_2, quantity: 1 }, { customRole: "Drone spotter", quantity: 1 }] }),
      d
    );
    expect(result.ok).toBe(true);
    expect(d.create).toHaveBeenCalledTimes(1);
    const requirements = d.create.mock.calls[0][1];
    expect(requirements.map((r: { role_label: string; quantity: number }) => `${r.quantity}×${r.role_label}`)).toEqual(["2×Photographer", "1×Videographer", "1×Drone spotter"]);
    if (result.ok) expect(result.record.requirements.reduce((n, r) => n + r.quantity, 0)).toBe(4);
  });

  it("supports a multi-day engagement (start and end dates preserved)", async () => {
    const d = deps();
    const result = await submitCrewSupportRequest(valid({ serviceFamily: "production", startDate: "2099-10-08", endDate: "2099-10-18" }), d);
    expect(result.ok).toBe(true);
    expect(d.create.mock.calls[0][0]).toMatchObject({ start_date: "2099-10-08", end_date: "2099-10-18" });
  });

  it("rejects invalid input with field errors and never writes", async () => {
    const d = deps();
    const result = await submitCrewSupportRequest(valid({ email: "nope", requirements: [], consent: false }), d);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    if (result.status !== 422) return;
    expect(Object.keys(result.fieldErrors)).toEqual(expect.arrayContaining(["email", "requirements", "consent"]));
    expect(d.create).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    const result = await submitCrewSupportRequest(valid({ startDate: "2099-10-10", endDate: "2099-10-01" }), deps());
    expect(result.ok).toBe(false);
    if (!result.ok && result.status === 422) expect(result.fieldErrors.endDate).toBeDefined();
  });

  it("rejects a start date in the past, an unknown service area, and a role with neither a title nor a description", () => {
    expect(crewSupportSchema.safeParse(valid({ startDate: "2020-01-01", endDate: "2020-01-01" })).success).toBe(false);
    expect(crewSupportSchema.safeParse(valid({ serviceFamily: "nonsense" })).success).toBe(false);
    expect(crewSupportSchema.safeParse(valid({ requirements: [{ quantity: 1 }] })).success).toBe(false);
  });

  it("a write failure returns a failure — never success, never a reference, no notifications-worthy record", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ create: vi.fn().mockResolvedValue({ ok: false, error: "db down" }) });
    const result = await submitCrewSupportRequest(valid(), d);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(JSON.stringify(result)).not.toMatch(/db down|CSR-/);
    spy.mockRestore();
  });

  it("an unexpected exception also fails closed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await submitCrewSupportRequest(valid(), deps({ generateReference: async () => { throw new Error("sequence unavailable"); } }));
    expect(result.ok).toBe(false);
    spy.mockRestore();
  });

  it("success wording never claims a booking, confirmation or guaranteed availability", () => {
    expect(SUBMITTED_MESSAGE).not.toMatch(/booked|booking confirmed|you are confirmed|guarantee/i);
    expect(SUBMITTED_MESSAGE).toMatch(/availability, pricing and next steps/);
    const record = { requestId: "r1", referenceNumber: "CSR-2099-000001", submittedAt: "", requesterName: "Ama Mensah", requesterEmail: "a@b.co", requesterPhone: "1", requesterCompany: "", leadCompany: "Studio X", requesterType: "photographer", serviceFamily: "photography", projectName: "Wedding", startDate: "2099-10-10", endDate: "2099-10-10", location: "Accra", requirements: [{ roleLabel: "Photographer", quantity: 1 }] };
    const ack = buildCrewSupportAcknowledgementEmail(record);
    expect(ack.text + ack.html).not.toMatch(/booking (is )?confirmed|you're booked|crew (is|are) (confirmed|assigned)/i);
    expect(ack.text).toMatch(/not a booking confirmation/);
  });

  it("the requester-facing email leaks no internal workflow data (admin link, slots, assignees)", () => {
    const record = { requestId: "secret-request-id", referenceNumber: "CSR-2099-000001", submittedAt: "", requesterName: "Ama", requesterEmail: "a@b.co", requesterPhone: "1", requesterCompany: "", leadCompany: "", requesterType: "photographer", serviceFamily: "photography", projectName: "Wedding", startDate: "2099-10-10", endDate: "2099-10-10", location: "Accra", requirements: [{ roleLabel: "Photographer", quantity: 1 }] };
    const ack = buildCrewSupportAcknowledgementEmail(record);
    expect(ack.html + ack.text).not.toMatch(/\/admin\/|secret-request-id|\bslots?\b|assignee|internal cost|profit margin/i);
    const internal = buildCrewSupportAdminNotificationEmail(record);
    expect(internal.text).toMatch(/\/admin\/crew-support\/secret-request-id/);
    expect(internal.text).toMatch(/not a booking/i);
  });
});

describe("conditional questions and service configuration", () => {
  it("photography/video get media questions; production gets logistics questions; neither gets the other's", () => {
    const ids = (f: string) => detailQuestionsFor(f).map((q) => q.id);
    expect(ids("photography")).toContain("mediaHandoff");
    expect(ids("production")).toContain("callTimesLogistics");
    expect(ids("production")).not.toContain("mediaHandoff");
  });

  it("stray answers from another service area are dropped, not stored", () => {
    expect(pickServiceDetails("production", { callTimesLogistics: "7am call", mediaHandoff: "RAW please", empty: " " })).toEqual({ callTimesLogistics: "7am call" });
  });

  it("service areas are derived from the existing pathways and include Other", () => {
    expect(SERVICE_FAMILIES.map((f) => f.value)).toEqual(["photography", "videography", "production", "content-creation", "graphic-design", "other"]);
  });
});

describe("status and assignment rules", () => {
  it("a new request can only move to review, decline or cancel — never straight to confirmed", () => {
    expect(allowedStatusTransitions("received")).toEqual(["under_review", "declined", "cancelled"]);
    expect(validateStatusChange("received", "confirmed", []).ok).toBe(false);
  });

  it("confirming needs at least one assigned person and no open slots", () => {
    expect(canConfirm([{ status: "unfilled", assigneeProfileId: null }]).ok).toBe(false);
    expect(canConfirm([{ status: "assigned", assigneeProfileId: "p1" }, { status: "proposed", assigneeProfileId: "p2" }]).ok).toBe(false);
    expect(canConfirm([{ status: "assigned", assigneeProfileId: "p1" }, { status: "released", assigneeProfileId: null }]).ok).toBe(true);
  });

  it("nobody is assigned without a person, and a closed request can't be changed", () => {
    expect(validateSlotChange({ requestStatus: "under_review", status: "assigned", assigneeProfileId: null }).ok).toBe(false);
    expect(validateSlotChange({ requestStatus: "under_review", status: "assigned", assigneeProfileId: "p1" }).ok).toBe(true);
    expect(validateSlotChange({ requestStatus: "cancelled", status: "released", assigneeProfileId: null }).ok).toBe(false);
  });
});

describe("internal access and duplicate-submission protection", () => {
  const user = (roles: string[]) => ({ id: "u", email: null, fullName: null, roles: roles as never, accessStatus: "active" as never });
  it("only admin and super_admin can view or manage Crew Support requests — not staff, clients, vendors or guests", () => {
    expect(canManageCrewSupport(user(["admin"]))).toBe(true);
    expect(canManageCrewSupport(user(["super_admin"]))).toBe(true);
    expect(canManageCrewSupport(user(["staff"]))).toBe(false);
    expect(canManageCrewSupport(user(["client", "vendor"]))).toBe(false);
    expect(canManageCrewSupport(null)).toBe(false);
  });

  it("the admin pages and actions gate on canManageCrewSupport before reading any data", () => {
    for (const f of ["src/app/admin/crew-support/page.tsx", "src/app/admin/crew-support/[id]/page.tsx"]) {
      expect(readFileSync(f, "utf8")).toMatch(/if \(!canManageCrewSupport\(user\)\) redirect\(/);
    }
    expect(readFileSync("src/app/admin/crew-support/actions.ts", "utf8").match(/canManageCrewSupport\(user\)/g)?.length).toBe(2);
  });

  it("the public route never imports the internal admin data module", () => {
    expect(readFileSync("src/app/api/crew-support/route.ts", "utf8")).not.toMatch(/crewSupport\/admin/);
    expect(readFileSync("src/app/crew-support/CrewSupportForm.tsx", "utf8")).not.toMatch(/crewSupport\/admin|assigneeProfile/);
  });

  it("a retried submission with the same idempotency key resolves to the first reference (server-side)", async () => {
    await storeResult("crew-test-key", "CSR-2099-000001", "supabase");
    expect((await getCachedResult("crew-test-key"))?.referenceNumber).toBe("CSR-2099-000001");
    const route = readFileSync("src/app/api/crew-support/route.ts", "utf8");
    expect(route.indexOf("getCachedResult")).toBeLessThan(route.indexOf("submitCrewSupportRequest(body"));
  });

  it("the form blocks a second click while a submission is in flight", () => {
    const form = readFileSync("src/app/crew-support/CrewSupportForm.tsx", "utf8");
    expect(form).toMatch(/if \(submitting\) return;/);
    expect(form).toMatch(/disabled=\{submitting/);
  });
});
