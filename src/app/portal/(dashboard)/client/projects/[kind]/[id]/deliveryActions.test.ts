import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryEvent } from "@/lib/portal/clientDelivery";

const h = vi.hoisted(() => ({
  user: { id: "client-1" } as { id: string } | null,
  owned: true,
  files: [{ fileId: "f1" }, { fileId: "f2" }] as { fileId: string }[],
  events: [] as DeliveryEvent[],
  fingerprints: [] as string[],
  recorded: [] as { action: string; metadata: Record<string, unknown> }[],
  notified: [] as { kind: string; remarks: string | null; enquiryId?: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/portal/clientDeliveryData", () => ({
  getReleasedContext: async () => (h.owned ? { enquiryId: "e", reference: "CSR-2026-000002", clientName: "Bright", files: h.files } : null),
  getDeliveryEvents: async () => h.events,
  getRatingFingerprints: async () => h.fingerprints,
  getJobForEnquiry: async () => ({ requestId: "req-1", professionalProfileId: "pro-1" }),
  recordClientEvent: async (e: { action: string; metadata: Record<string, unknown> }) => { h.recorded.push(e); },
  notifyAdminOfClientDelivery: async (e: { kind: string; remarks: string | null }) => { h.notified.push(e); },
}));

import { confirmDeliveryAction, submitRatingAction } from "./deliveryActions";

const ENQ = "3473596c-3ea4-4b1b-820e-733629dbebf8";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(() => { h.user = { id: "client-1" }; h.owned = true; h.events = []; h.fingerprints = []; h.recorded = []; h.notified = []; });

describe("confirmDeliveryAction", () => {
  it("records receipt WITHOUT requiring any comment, and notifies the administrator once", async () => {
    const r = await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "receipt" }));
    expect(r).toMatchObject({ ok: true });
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].action).toBe("client_delivery.receipt_confirmed");
    expect(h.recorded[0].metadata).toMatchObject({ reference: "CSR-2026-000002", requestId: "req-1", fileCount: 2, remarks: null });
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]).toMatchObject({ kind: "receipt", reference: "CSR-2026-000002", clientName: "Bright", requestId: "req-1", enquiryId: ENQ, fileCount: 2, remarks: null });
  });

  it("receipt and acceptance are separate records", async () => {
    await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "receipt" }));
    await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "accept" }));
    expect(h.recorded.map((e) => e.action)).toEqual(["client_delivery.receipt_confirmed", "client_delivery.accepted"]);
  });

  it("records corrections with an optional note", async () => {
    await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "corrections", remarks: "  Please brighten HD 7  " }));
    expect(h.recorded[0]).toMatchObject({ action: "client_delivery.corrections_requested", metadata: { remarks: "Please brighten HD 7" } });
  });

  it("the same confirmation of the same files is recorded and announced only once (no duplicate messages)", async () => {
    const first = await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "accept" }));
    expect(first).toMatchObject({ ok: true });
    const batch = h.recorded[0].metadata.batch as string;
    h.events = [{ action: "client_delivery.accepted", at: "2026-10-22T13:00:00Z", batch, remarks: null }];
    const again = await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "accept" }));
    expect(again).toMatchObject({ ok: true, message: expect.stringContaining("already recorded") });
    expect(h.recorded).toHaveLength(1);
    expect(h.notified).toHaveLength(1);
  });

  it("refuses someone who does not own the project, and malformed requests", async () => {
    h.owned = false;
    expect(await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "accept" }))).toMatchObject({ ok: false });
    h.owned = true;
    expect(await confirmDeliveryAction(null, form({ enquiryId: "nope", kind: "accept" }))).toMatchObject({ ok: false });
    expect(await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "complete-project" }))).toMatchObject({ ok: false });
    h.user = null;
    expect(await confirmDeliveryAction(null, form({ enquiryId: ENQ, kind: "accept" }))).toMatchObject({ ok: false });
    expect(h.recorded).toHaveLength(0);
  });

  it("only RECORDS: the action module touches no request, engagement, payable, file or backup state", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("./deliveryActions.ts", import.meta.url), "utf8");
    for (const forbidden of ["setCrewSupportStatus", "setEngagementStatus", "payment_obligations", "project_files", "confirmProjectFilesBackup", "purge", "sendFilesReadyEmail", "dispatchNotification"]) expect(src).not.toContain(forbidden);
  });
});

describe("submitRatingAction", () => {
  it("accepts an overall rating alone and records it against the project, service and assigned professional", async () => {
    const r = await submitRatingAction(null, form({ enquiryId: ENQ, overall: "10" }));
    expect(r).toMatchObject({ ok: true });
    expect(h.recorded[0].action).toBe("client_feedback.rating_submitted");
    expect(h.recorded[0].metadata).toMatchObject({ reference: "CSR-2026-000002", requestId: "req-1", service: "crew-support", professionalProfileId: "pro-1", ratings: { overall: 10 }, comment: null });
    expect(h.notified).toHaveLength(1); // the administrator is told once about new feedback
    expect(h.notified[0]).toMatchObject({ kind: "rating", enquiryId: ENQ });
  });

  it("takes the five categories and an optional comment", async () => {
    await submitRatingAction(null, form({ enquiryId: ENQ, quality: "9", professionalism: "10", communication: "8", punctuality: "7", overall: "9", comment: "Great work" }));
    expect(h.recorded[0].metadata).toMatchObject({ ratings: { quality: 9, professionalism: 10, communication: 8, punctuality: 7, overall: 9 }, comment: "Great work" });
  });

  it("refuses an empty submission or out-of-range numbers, and records nothing", async () => {
    expect(await submitRatingAction(null, form({ enquiryId: ENQ }))).toMatchObject({ ok: false });
    expect(await submitRatingAction(null, form({ enquiryId: ENQ, overall: "11" }))).toMatchObject({ ok: false });
    expect(await submitRatingAction(null, form({ enquiryId: ENQ, overall: "0" }))).toMatchObject({ ok: false });
    expect(h.recorded).toHaveLength(0);
  });

  it("an identical resubmission is not recorded twice", async () => {
    await submitRatingAction(null, form({ enquiryId: ENQ, overall: "8" }));
    h.fingerprints = [h.recorded[0].metadata.fingerprint as string];
    const again = await submitRatingAction(null, form({ enquiryId: ENQ, overall: "8" }));
    expect(again).toMatchObject({ ok: true, message: expect.stringContaining("already recorded") });
    expect(h.recorded).toHaveLength(1);
    expect(h.notified).toHaveLength(1); // and not told again about an identical resubmission
  });

  it("requires the client's own project", async () => {
    h.owned = false;
    expect(await submitRatingAction(null, form({ enquiryId: ENQ, overall: "9" }))).toMatchObject({ ok: false });
    expect(h.recorded).toHaveLength(0);
  });
});
