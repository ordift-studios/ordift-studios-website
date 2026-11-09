import { describe, expect, it } from "vitest";
import { buildClientBookingConfirmed, buildInternalBookingConfirmed, formatPlace, formatSession, proposedClientCancellationNotice, proposedClientRescheduleNotice, type ClientConfirmationData, type InternalConfirmationData } from "./notificationContent";

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

describe("PROPOSED client cancellation / reschedule wording (not sent anywhere)", () => {
  const c = proposedClientCancellationNotice({ firstName: "Ama", referenceNumber: "ENQ-JRN-GHP", service: "photography", cancelledSession: "Tuesday, 15 December 2026, 10:00–11:00 (Africa/Accra, GMT)" });
  const r = proposedClientRescheduleNotice({ firstName: "Ama", referenceNumber: "ENQ-JRN-GHP", service: "photography", previousSession: "Tuesday, 15 December 2026, 10:00–11:00 (Africa/Accra, GMT)", newSession: "Thursday 17 December 2026, 14:00–15:00 (Africa/Accra, GMT)", newPlace: "At the studio — Synthetic studio, Accra" });
  it("a cancellation says the booking is no longer confirmed and that quotation and payments are unchanged; it never says it remains confirmed", () => {
    expect(c.text).toMatch(/has been cancelled/); expect(c.text).toMatch(/no longer confirmed/); expect(c.text).toMatch(/quotation and any payment you have made are unchanged/); expect(c.text).not.toMatch(/remains confirmed|is confirmed|refund/i);
  });
  it("a reschedule names the old and the new details and says the booking remains confirmed ONLY on the new ones", () => {
    expect(r.text).toContain("Previously: Tuesday, 15 December"); expect(r.text).toContain("Now confirmed: Thursday 17 December"); expect(r.text).toMatch(/remains confirmed on the new details/);
  });
});
