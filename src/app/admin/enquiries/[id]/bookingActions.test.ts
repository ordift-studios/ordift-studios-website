import { beforeEach, describe, expect, it, vi } from "vitest";

// Authorization tests for the booking server actions: staff, admin, a client and a signed-out visitor are all refused BEFORE anything is read or written;
// and who verified a conflict is decided by the server, never taken from the form.
const h = vi.hoisted(() => ({
  user: null as null | { id: string; roles: string[] },
  confirm: vi.fn(), cancel: vi.fn(), preview: vi.fn(), loadCtx: vi.fn(), loadCurrent: vi.fn(), settings: vi.fn(), pool: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isSuperAdmin: (u: { roles: string[] } | null) => Boolean(u?.roles.includes("super_admin")) }));
vi.mock("@/lib/bookings/service", () => ({ confirmOrdinaryBooking: h.confirm, cancelOrdinaryBooking: h.cancel, previewConflicts: h.preview, loadBookingSettings: h.settings }));
vi.mock("@/lib/bookings/panel", async (orig) => ({ ...(await orig<typeof import("@/lib/bookings/panel")>()), loadAcceptedContext: h.loadCtx, loadCurrentBooking: h.loadCurrent }));
vi.mock("@/lib/crewSupport/candidates", () => ({ listOverridePool: h.pool }));
import { cancelBookingAction, confirmBookingAction, previewBookingAction } from "./bookingActions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const form = { enquiryId: "e1", quotationId: "q1", expectedVersion: "0", assignedProfileId: "p1", segCount: "1", seg0_start: "2026-12-01T09:00", seg0_end: "2026-12-01T12:00", seg0_tz: "Asia/Qatar", seg0_kind: "on_site", seg0_location: "Doha studio", confirmSentence: "confirm booking ENQ-1" };
const ctx = { enquiry: { id: "e1", reference: "ENQ-1", crmStage: "quotation_sent", amountDueUsd: null, verifiedPaidUsd: null }, quotation: { id: "q1", reference: "Q-1", currency: "QAR", total: 1000, paymentCondition: "none", depositPercent: null, termsText: "No deposit is required." }, activities: ["photography"], entityId: "x", entityEligible: true, entityBlockers: [], executedAgreement: null };
const settings = { version: 1, status: "provisional", thresholds: { QAR: 5000 }, alwaysCategories: [], escalators: ["minors"] };
const ON = process.env.BOOKING_CONFIRMATION_ENABLED;
beforeEach(() => { process.env.BOOKING_CONFIRMATION_ENABLED = "true"; Object.values(h).forEach((m) => typeof m === "function" && "mockReset" in m && (m as ReturnType<typeof vi.fn>).mockReset());
  h.user = { id: "u1", roles: ["super_admin"] }; h.loadCtx.mockResolvedValue(ctx); h.loadCurrent.mockResolvedValue(null); h.settings.mockResolvedValue(settings); h.pool.mockResolvedValue([{ profileId: "p1", name: "A", memberNumber: "M1" }]); h.preview.mockResolvedValue([]); });
import { afterEach } from "vitest";
afterEach(() => { if (ON === undefined) delete process.env.BOOKING_CONFIRMATION_ENABLED; else process.env.BOOKING_CONFIRMATION_ENABLED = ON; });

describe("everyone but a Super Admin is refused before anything is read or written", () => {
  for (const who of [{ label: "staff", user: { id: "s", roles: ["staff"] } }, { label: "admin", user: { id: "a", roles: ["admin"] } }, { label: "a client", user: { id: "c", roles: ["client"] } }, { label: "a signed-out visitor", user: null }]) {
    it(`${who.label} cannot check, confirm or cancel`, async () => {
      h.user = who.user;
      expect(await previewBookingAction(null, fd(form))).toMatchObject({ ok: false, error: expect.stringMatching(/Only a Super Admin/) });
      expect(await confirmBookingAction(null, fd(form))).toMatchObject({ ok: false, error: expect.stringMatching(/Only a Super Admin/) });
      expect(await cancelBookingAction(null, fd({ enquiryId: "e1", reason: "client withdrew in writing", confirmSentence: "cancel booking ENQ-1", expectedVersion: "1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/Only a Super Admin/) });
      expect(h.loadCtx).not.toHaveBeenCalled(); expect(h.confirm).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled(); expect(h.preview).not.toHaveBeenCalled();
    });
  }
  it("a Super Admin is still refused while the flag is off", async () => {
    delete process.env.BOOKING_CONFIRMATION_ENABLED;
    expect(await confirmBookingAction(null, fd(form))).toMatchObject({ ok: false, error: expect.stringMatching(/not switched on/) }); expect(h.confirm).not.toHaveBeenCalled();
  });
});

describe("confirming", () => {
  it("needs the exact typed sentence", async () => {
    expect(await confirmBookingAction(null, fd({ ...form, confirmSentence: "yes" }))).toMatchObject({ ok: false, error: expect.stringMatching(/type exactly: confirm booking ENQ-1/) }); expect(h.confirm).not.toHaveBeenCalled();
  });
  it("refuses a stale form (someone else changed the booking)", async () => {
    h.loadCurrent.mockResolvedValue({ id: "c1", version: 3, kind: "confirmed", segments: [] });
    expect(await confirmBookingAction(null, fd(form))).toMatchObject({ ok: false, error: expect.stringMatching(/changed by someone else/) }); expect(h.confirm).not.toHaveBeenCalled();
  });
  it("refuses a quotation id that is not the accepted one, and a person who is not an active team member", async () => {
    expect(await confirmBookingAction(null, fd({ ...form, quotationId: "other" }))).toMatchObject({ ok: false });
    expect(await confirmBookingAction(null, fd({ ...form, assignedProfileId: "stranger" }))).toMatchObject({ ok: false, error: expect.stringMatching(/active team members/) }); expect(h.confirm).not.toHaveBeenCalled();
  });
  it("blockers stop it before the service is called; a ready booking calls the service with server-decided fields", async () => {
    h.loadCtx.mockResolvedValue({ ...ctx, quotation: { ...ctx.quotation, paymentCondition: "full", termsText: "Full payment is required in advance." }, enquiry: { ...ctx.enquiry, amountDueUsd: 500, verifiedPaidUsd: 0 } });
    expect(await confirmBookingAction(null, fd(form))).toMatchObject({ ok: false, error: expect.stringMatching(/Not ready to confirm/) }); expect(h.confirm).not.toHaveBeenCalled();
    h.loadCtx.mockResolvedValue(ctx); h.confirm.mockResolvedValue({ ok: true, confirmationId: "c9" });
    expect(await confirmBookingAction(null, fd({ ...form, agreementId: "attacker-agreement", supersedes: "attacker" }))).toMatchObject({ ok: true });
    const arg = h.confirm.mock.calls[0][0]; expect(arg.actorUserId).toBe("u1"); expect(arg.quotationId).toBe("q1"); expect(arg.agreementId).toBeNull(); expect(arg.supersedes).toBeNull();
  });
  it("a conflict resolution is attributed to the ASSIGNED person, not to whoever the form names, and only when the box is ticked", async () => {
    const firm = [{ key: "leave:1", kind: "leave", firm: true, overridable: true, label: "approved leave", from: "2026-12-01", to: "2026-12-01" }];
    h.preview.mockResolvedValue(firm); h.confirm.mockResolvedValue({ ok: true, confirmationId: "c1" });
    const res = { resCount: "1", res0_key: "leave:1", res0_method: "call", res0_reference: "call on 7 Nov, noted in WhatsApp", res0_on: "2026-11-07", res0_verifiedWithProfileId: "attacker" };
    expect(await confirmBookingAction(null, fd({ ...form, ...res }))).toMatchObject({ ok: false, error: expect.stringMatching(/Firm scheduling conflict/) }); expect(h.confirm).not.toHaveBeenCalled();
    expect(await confirmBookingAction(null, fd({ ...form, ...res, res0_confirm: "on" }))).toMatchObject({ ok: true });
    expect(h.confirm.mock.calls[0][0].conflictResolutions[0]).toMatchObject({ key: "leave:1", verifiedWithProfileId: "p1" });
  });
  it("an overlap with a CONFIRMED booking or assignment of the same person cannot be cleared by any resolution the form sends; the person must change the person or the time", async () => {
    const booking = [{ key: "booking:b1", kind: "booking", firm: true, overridable: false, label: "ENQ-OTHER", from: "2026-12-01T06:00:00Z", to: "2026-12-01T09:00:00Z" }];
    h.preview.mockResolvedValue(booking); h.confirm.mockResolvedValue({ ok: true, confirmationId: "c1" });
    const res = { resCount: "1", res0_key: "booking:b1", res0_method: "call", res0_reference: "call on 7 Nov, noted in WhatsApp", res0_on: "2026-11-07", res0_confirm: "on" };
    expect(await confirmBookingAction(null, fd({ ...form, ...res }))).toMatchObject({ ok: false, error: expect.stringMatching(/cannot clear a confirmed overlap/) });
    expect(h.confirm).not.toHaveBeenCalled();
    const crew = [{ key: "crew_slot:s1", kind: "crew_slot", firm: true, overridable: false, label: "CSR-1", from: "2026-12-01", to: "2026-12-02" }];
    h.preview.mockResolvedValue(crew); expect(await confirmBookingAction(null, fd({ ...form, resCount: "1", res0_key: "crew_slot:s1", res0_method: "call", res0_reference: "call on 7 Nov, noted in WhatsApp", res0_on: "2026-11-07", res0_confirm: "on" }))).toMatchObject({ ok: false });
    expect(h.confirm).not.toHaveBeenCalled();
  });
  it("a change uses the 'change' sentence and supersedes the server-known current version", async () => {
    h.loadCurrent.mockResolvedValue({ id: "c1", version: 1, kind: "confirmed", segments: [] }); h.confirm.mockResolvedValue({ ok: true, confirmationId: "c2" });
    expect(await confirmBookingAction(null, fd({ ...form, expectedVersion: "1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/change booking ENQ-1/) });
    expect(await confirmBookingAction(null, fd({ ...form, expectedVersion: "1", confirmSentence: "change booking ENQ-1" }))).toMatchObject({ ok: true });
    expect(h.confirm.mock.calls[0][0].supersedes).toBe("c1");
  });
});

describe("cancelling", () => {
  const c = { enquiryId: "e1", reason: "Client withdrew in writing on 7 Nov", confirmSentence: "cancel booking ENQ-1", expectedVersion: "1" };
  it("needs a live booking, the current version and the exact sentence; then calls the service as the signed-in Super Admin", async () => {
    expect(await cancelBookingAction(null, fd(c))).toMatchObject({ ok: false, error: expect.stringMatching(/no confirmed booking/) });
    h.loadCurrent.mockResolvedValue({ id: "c1", version: 1, kind: "confirmed", segments: [] }); h.cancel.mockResolvedValue({ ok: true, confirmationId: "c2" });
    expect(await cancelBookingAction(null, fd({ ...c, expectedVersion: "0" }))).toMatchObject({ ok: false, error: expect.stringMatching(/changed by someone else/) });
    expect(await cancelBookingAction(null, fd({ ...c, confirmSentence: "cancel" }))).toMatchObject({ ok: false, error: expect.stringMatching(/type exactly/) }); expect(h.cancel).not.toHaveBeenCalled();
    expect(await cancelBookingAction(null, fd(c))).toMatchObject({ ok: true }); expect(h.cancel.mock.calls[0][0]).toMatchObject({ actorUserId: "u1", enquiryId: "e1" });
  });
});
