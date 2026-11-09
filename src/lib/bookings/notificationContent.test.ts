import { describe, expect, it } from "vitest";
import { buildClientBookingConfirmed, buildInternalBookingConfirmed, formatPlace, formatSession, buildAssignedBookingNotice, buildClientBookingNotice, type ClientConfirmationData, type InternalConfirmationData } from "./notificationContent";

const gh = { startsAt: "2026-12-15T10:00:00Z", endsAt: "2026-12-15T11:00:00Z", timezone: "Africa/Accra", kind: "studio" as const, location: "Synthetic studio, Accra", platform: null, note: null };
const qa = { startsAt: "2026-12-15T06:00:00Z", endsAt: "2026-12-15T09:00:00Z", timezone: "Asia/Qatar", kind: "on_site" as const, location: "Client villa, West Bay, Doha", platform: null, note: "Bring two lenses" };
const online = { startsAt: "2026-12-16T12:00:00Z", endsAt: "2026-12-16T13:00:00Z", timezone: "Europe/London", kind: "online" as const, location: null, platform: "Google Meet", note: null };
const client = (over: Partial<ClientConfirmationData> = {}): ClientConfirmationData => ({ enquiryId: "e1", referenceNumber: "ENQ-JRN-GHP", fullName: "Ama Mensah", service: "photography", quotationReference: "ORD-QUO-JRN-GHP", sessions: [gh], siteUrl: "https://lab.example.test", version: 1, ...over });
const internal = (over: Partial<InternalConfirmationData> = {}): InternalConfirmationData => ({ enquiryId: "e1", referenceNumber: "ENQ-JRN-QAP", clientName: "Client Q", service: "photography", quotationReference: "ORD-QUO-JRN-QAP", sessions: [qa], siteUrl: "https://lab.example.test", version: 1, renewed: false,
  assignedLabel: "INT0007 — Lab staff", confirmedByLabel: "INT0001 — Lab super_admin", agreementRequired: false, agreementReference: null, paymentCondition: "full", verifiedPaidUsd: 500, outstandingUsd: 0, basis: null, ...over });

describe("formatSession / formatPlace", () => {
  it("shows the local date, the time range and the zone, for Ghana and Qatar", () => {
    expect(formatSession(gh)).toBe("Tuesday, 15 December 2026, 10:00–11:00 (Africa/Accra, GMT)");
    expect(formatSession(qa)).toBe("Tuesday, 15 December 2026, 09:00–12:00 (Asia/Qatar, GMT+3)");
  });
  it("a session crossing midnight shows both dates", () => { expect(formatSession({ startsAt: "2026-12-15T20:00:00Z", endsAt: "2026-12-16T02:00:00Z", timezone: "Africa/Accra" })).toMatch(/15 December 2026 20:00 – .*16 December 2026 02:00/); });
  it("place: studio / on site use the place, online uses the platform, a missing detail is never invented", () => {
    expect(formatPlace(gh)).toBe("At the studio — Synthetic studio, Accra"); expect(formatPlace(qa)).toBe("On site — Client villa, West Bay, Doha"); expect(formatPlace(online)).toBe("Online — Google Meet");
    expect(formatPlace({ kind: "on_site", location: "  ", platform: null })).toBe("On site — details to be confirmed with you");
  });
});

describe("client Booking Confirmed e-mail", () => {
  it("carries the reference, the date and time with the zone, the service, the arrangement and the contact", () => {
    const m = buildClientBookingConfirmed(client());
    expect(m.subject).toBe("Booking Confirmed — ENQ-JRN-GHP");
    for (const part of ["Booking reference: ENQ-JRN-GHP", "Service: Photography", "Date and time: Tuesday, 15 December 2026, 10:00–11:00 (Africa/Accra, GMT)", "At the studio — Synthetic studio, Accra", "Quotation: ORD-QUO-JRN-GHP", "support@ordiftstudios.com", "https://lab.example.test/portal/client/projects/enquiry/e1/booking-details"]) { expect(m.text).toContain(part); }
    expect(m.html).toContain("ENQ-JRN-GHP"); expect(m.html).toContain("Africa/Accra");
  });
  it("lists every session of a multi-session booking, with notes, and an online session names the platform", () => {
    const m = buildClientBookingConfirmed(client({ sessions: [qa, online] }));
    expect(m.text).toContain("Session 1: Tuesday, 15 December 2026, 09:00–12:00 (Asia/Qatar, GMT+3)"); expect(m.text).toContain("Bring two lenses"); expect(m.text).toContain("Session 2:"); expect(m.text).toContain("Online — Google Meet");
  });
  it("never exposes money, the assigned person, agreements or internal notes to the client", () => {
    const m = buildClientBookingConfirmed(client({ sessions: [qa] })).text;
    expect(m).not.toMatch(/\$|USD|GHS|QAR|paid|outstanding|assigned|INT\d|agreement|basis|member/i);
  });
  it("escapes the client's name and the free-text fields", () => {
    const m = buildClientBookingConfirmed(client({ fullName: "<script>x</script> Ama", sessions: [{ ...qa, note: "<img src=x onerror=1>" }] }));
    expect(m.html).not.toContain("<script>"); expect(m.html).not.toContain("<img src=x"); expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("internal New Booking Confirmed notice", () => {
  it("carries the reference, assigned personnel (member number first), date/time in both local and UTC, arrangement and operational facts", () => {
    const m = buildInternalBookingConfirmed(internal());
    expect(m.subject).toBe("New Booking Confirmed — ENQ-JRN-QAP");
    for (const part of ["Booking reference: ENQ-JRN-QAP", "Assigned: INT0007 — Lab staff", "Date and time: Tuesday, 15 December 2026, 09:00–12:00 (Asia/Qatar, GMT+3) · 2026-12-15 06:00–09:00 UTC", "Arrangement: On site — Client villa", "Verified paid: $500.00", "Outstanding: $0.00", "Agreement: Not required", "Confirmed by: INT0001 — Lab super_admin", "/admin/enquiries/e1"]) expect(m.text).toContain(part);
  });
  it("says so when nobody is assigned, when an agreement is required, and when it is a re-confirmation", () => {
    const m = buildInternalBookingConfirmed(internal({ assignedLabel: null, agreementRequired: true, agreementReference: "AGR-2026-0007", renewed: true })).text;
    expect(m).toContain("Assigned: No person assigned"); expect(m).toContain("Agreement: Required — AGR-2026-0007"); expect(m).toContain("Re-confirmed after an earlier cancellation");
  });
});

const oldS = { ...gh, startsAt: "2026-12-15T10:00:00Z", endsAt: "2026-12-15T11:00:00Z" }, newS = { ...gh, startsAt: "2026-12-18T09:00:00Z", endsAt: "2026-12-18T10:00:00Z" };
describe("client notices for a reschedule and the two kinds of cancellation (each reflects the CURRENT state)", () => {
  const base = client({ sessions: [newS] });
  const ch = buildClientBookingNotice({ ...base, event: "changed", previousSessions: [oldS] });
  it("a reschedule names the old and the new details and is confirmed on the new ones only", () => {
    expect(ch.subject).toBe("Booking updated — ENQ-JRN-GHP"); expect(ch.text).toContain("Previously: Tuesday, 15 December 2026, 10:00–11:00"); expect(ch.text).toContain("Now confirmed: Friday, 18 December 2026, 09:00–10:00 (Africa/Accra, GMT)"); expect(ch.text).toMatch(/confirmed on the new details above only/);
  });
  it("a reschedule to a client who was never told the earlier date shows only the new details (no invented 'previously')", () => {
    const m = buildClientBookingNotice({ ...base, event: "changed", previousSessions: null }).text; expect(m).not.toContain("Previously"); expect(m).toContain("Now confirmed:");
  });
  const pend = buildClientBookingNotice({ ...client({ sessions: [oldS] }), event: "cancelled_pending" });
  it("a cancellation awaiting rescheduling says it is no longer confirmed, that a new date will be agreed, and that quotation and payments are unchanged", () => {
    expect(pend.subject).toBe("Booking cancelled — new date to be agreed — ENQ-JRN-GHP"); expect(pend.text).toMatch(/no longer confirmed/); expect(pend.text).toMatch(/contact you to agree a new date/); expect(pend.text).toMatch(/quotation and any payment you have made are unchanged/); expect(pend.text).toContain("Cancelled: Tuesday, 15 December 2026"); expect(pend.text).not.toMatch(/remains confirmed|confirmed on the new|refund/i);
  });
  it("a final cancellation says it will not be rescheduled; money is mentioned only if the client paid, and never promised back", () => {
    const paid = buildClientBookingNotice({ ...client({ sessions: [oldS] }), event: "cancelled_final", paidAnything: true }).text, unpaid = buildClientBookingNotice({ ...client({ sessions: [oldS] }), event: "cancelled_final", paidAnything: false }).text;
    expect(paid).toMatch(/will not be rescheduled/); expect(paid).toMatch(/not been changed or refunded by this cancellation; we will contact you separately/); expect(unpaid).not.toMatch(/payment/i); expect(paid).not.toMatch(/will be refunded|full refund/i);
  });
  it("none of the three exposes internal facts, and the free text is escaped", () => {
    for (const m of [ch, pend]) expect(m.text).not.toMatch(/INT\d|assigned|agreement|basis|USD|\$\d/i);
    expect(buildClientBookingNotice({ ...client({ fullName: "<b>x</b> Ama", sessions: [newS] }), event: "changed" }).html).not.toContain("<b>x</b>");
  });
});

describe("assigned-person notices carry operational facts only", () => {
  const d = { referenceNumber: "ENQ-JRN-QAN", service: "photography", clientFirstName: "Kofi", sessions: [qa], previousSessions: [{ ...qa, startsAt: "2026-12-14T06:00:00Z", endsAt: "2026-12-14T09:00:00Z" }], version: 3 };
  it("assigned / changed / cancelled / released each say the right thing", () => {
    expect(buildAssignedBookingNotice({ ...d, kind: "assigned", event: "confirmed" }).text).toMatch(/You are assigned to a confirmed Photography booking \(ENQ-JRN-QAN\) for Kofi/);
    const c = buildAssignedBookingNotice({ ...d, kind: "assigned", event: "changed" }).text; expect(c).toContain("Was:"); expect(c).toContain("Now:");
    expect(buildAssignedBookingNotice({ ...d, kind: "assigned", event: "cancelled_pending" }).text).toMatch(/new date may follow/); expect(buildAssignedBookingNotice({ ...d, kind: "assigned", event: "cancelled_final" }).text).toMatch(/cancelled for good/);
    const r = buildAssignedBookingNotice({ ...d, kind: "released", event: "changed" }); expect(r.subject).toBe("You are no longer assigned — ENQ-JRN-QAN"); expect(r.text).toContain("Was:");
  });
  it("never carries money, agreements, the client's surname, e-mail or phone", () => {
    for (const ev of ["confirmed", "changed", "cancelled_pending", "cancelled_final"] as const) { const m = buildAssignedBookingNotice({ ...d, kind: "assigned", event: ev }); expect(m.text + m.html).not.toMatch(/\$|USD|QAR|paid|outstanding|agreement|@|\+\d{6}|quotation/i); }
  });
});

describe("internal notice variants", () => {
  const ia = internal({ event: "changed", previousSessions: [gh], reason: undefined });
  it("the full variant shows money; the operational variant (Admins, no amounts by policy) never does", () => {
    const full = buildInternalBookingConfirmed({ ...ia, showMoney: true }).text, ops = buildInternalBookingConfirmed({ ...ia, showMoney: false }).text;
    expect(full).toContain("Verified paid: $500.00"); expect(ops).not.toMatch(/Verified paid|Outstanding|Payment condition|\$|Basis/);
    expect(full).toContain("Was:"); expect(full.startsWith("Booking Rescheduled")).toBe(true);
  });
  it("a cancellation shows the reason and says whether it is final; a final one says nothing was refunded", () => {
    const p = buildInternalBookingConfirmed({ ...internal({ event: "cancelled_pending", reason: "Client moved the date" }) }); expect(p.subject).toBe("Booking Cancelled — Rescheduling Pending — ENQ-JRN-QAP"); expect(p.text).toContain("Reason: Client moved the date"); expect(p.text).toContain("Cancelled booking:");
    const f = buildInternalBookingConfirmed({ ...internal({ event: "cancelled_final", reason: "Client withdrew" }) }); expect(f.subject).toBe("Booking Cancelled (final) — ENQ-JRN-QAP"); expect(f.text).toMatch(/Nothing was refunded or changed/);
  });
});
