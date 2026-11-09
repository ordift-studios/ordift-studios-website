import { describe, expect, it } from "vitest";
import { chooseClientAddress } from "./clientAddress";
import { clientNoticeOutstanding } from "./noticeOutstanding";
import { parseCancelOutcome, parseNoticeChoice } from "./form";
import { receiptSchedulingNote } from "./paymentStagePolicy";

const base = { hasOwner: false, ownerEmail: null, ownerConfirmed: false, enquiryEmail: "typed@example.test", enquiryEmailIsPlaceholder: false, suppressed: false };
describe("chooseClientAddress", () => {
  it("a verified owner's confirmed account address wins over anything typed", () => { expect(chooseClientAddress({ ...base, hasOwner: true, ownerEmail: "acct@example.test", ownerConfirmed: true, suppressed: true })).toEqual({ send: true, to: "acct@example.test", via: "portal_account" }); });
  it("an owner whose address is unconfirmed, missing or unreadable gets nothing, with no fall-back to the typed address", () => {
    expect(chooseClientAddress({ ...base, hasOwner: true, ownerEmail: "a@b.test", ownerConfirmed: false })).toEqual({ send: false, reason: "account_unconfirmed" });
    expect(chooseClientAddress({ ...base, hasOwner: true, ownerEmail: null, ownerConfirmed: true })).toEqual({ send: false, reason: "account_unconfirmed" });
    expect(chooseClientAddress({ ...base, hasOwner: true, ownerLookupFailed: true })).toEqual({ send: false, reason: "account_lookup_failed" });
  });
  it("no owner: a website-form address is used (existing policy); a staff-recorded one is not; no address is no address", () => {
    expect(chooseClientAddress(base)).toEqual({ send: true, to: "typed@example.test", via: "enquiry_email" });
    expect(chooseClientAddress({ ...base, suppressed: true })).toEqual({ send: false, reason: "suppressed" });
    expect(chooseClientAddress({ ...base, staffRecorded: true, suppressed: false })).toEqual({ send: false, reason: "suppressed" });          // staff allowed the lifecycle e-mails: booking details still need the verified route
    expect(chooseClientAddress({ ...base, staffRecorded: true, hasOwner: true, ownerEmail: "a@b.test", ownerConfirmed: true })).toMatchObject({ send: true, via: "portal_account" });   // once the client has claimed the project, the verified account address is used
    expect(chooseClientAddress({ ...base, enquiryEmail: null })).toEqual({ send: false, reason: "no_email" });
    expect(chooseClientAddress({ ...base, enquiryEmailIsPlaceholder: true, suppressed: true })).toEqual({ send: false, reason: "no_email" });
  });
});

describe("clientNoticeOutstanding (only the CURRENT version can be outstanding)", () => {
  const job = (o: Record<string, unknown>) => ({ confirmation_id: "c2", audience: "client", event: "changed", status: "sent", provider_result: null, last_error: null, deferred_reason: null, ...o });
  it("sent (automatically or recorded by a person) is nothing outstanding", () => { expect(clientNoticeOutstanding([job({})], "c2")).toBeNull(); expect(clientNoticeOutstanding([job({ provider_result: "manual_whatsapp" })], "c2")).toBeNull(); });
  it("deferred shows the reason; skipped says why and what to do; failed and pending say what to press", () => {
    expect(clientNoticeOutstanding([job({ status: "deferred", deferred_reason: "phoning first" })], "c2")?.text).toMatch(/NOT been told.*phoning first/);
    expect(clientNoticeOutstanding([job({ status: "skipped", provider_result: "suppressed" })], "c2")?.text).toMatch(/NOT been e-mailed.*record it/);
    expect(clientNoticeOutstanding([job({ status: "failed", last_error: "provider-down" })], "c2")?.text).toMatch(/failed: provider-down/);
    expect(clientNoticeOutstanding([job({ status: "pending" })], "c2")?.kind).toBe("pending");
  });
  it("an older version's job and a missing current version are never outstanding", () => { expect(clientNoticeOutstanding([job({ status: "deferred", confirmation_id: "c1" })], "c2")).toBeNull(); expect(clientNoticeOutstanding([job({ status: "deferred" })], null)).toBeNull(); });
});

const fd = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null), getAll: (k: string) => (k in o ? [o[k]] : []) });
describe("form choices", () => {
  it("telling the client is the default and the fallback", () => { expect(parseNoticeChoice(fd({}))).toEqual({ ok: true, deferReason: null }); expect(parseNoticeChoice(fd({ notifyClient: "yes" }))).toEqual({ ok: true, deferReason: null }); expect(parseNoticeChoice(fd({ notifyClient: "banana" }))).toEqual({ ok: true, deferReason: null }); });
  it("holding back needs a written reason", () => { expect(parseNoticeChoice(fd({ notifyClient: "defer", deferReason: "no" })).ok).toBe(false); expect(parseNoticeChoice(fd({ notifyClient: "defer" })).ok).toBe(false); expect(parseNoticeChoice(fd({ notifyClient: "defer", deferReason: "  phoning the client first  " }))).toEqual({ ok: true, deferReason: "phoning the client first" }); });
  it("the cancellation outcome must be one of the two", () => { expect(parseCancelOutcome(fd({ outcome: "final" }))).toBe("final"); expect(parseCancelOutcome(fd({ outcome: "rescheduling_pending" }))).toBe("rescheduling_pending"); expect(parseCancelOutcome(fd({}))).toBeNull(); expect(parseCancelOutcome(fd({ outcome: "refund" }))).toBeNull(); });
});

describe("receiptSchedulingNote (the 'paid but what about my date' gap)", () => {
  const i = { flagOn: true, autoBookOff: false, entityType: "enquiry", crmStage: "quotation_sent" };
  it("appears while payments do not book the project and the project is not yet booked", () => { expect(receiptSchedulingNote(i)).toMatch(/does not by itself confirm a date/); expect(receiptSchedulingNote({ ...i, flagOn: false, autoBookOff: true })).not.toBeNull(); });
  it("absent in legacy mode (a payment books the project), for workshops, Crew Support, and a project already booked or under way", () => {
    expect(receiptSchedulingNote({ ...i, flagOn: false })).toBeNull(); expect(receiptSchedulingNote({ ...i, entityType: "workshop_registration" })).toBeNull(); expect(receiptSchedulingNote({ ...i, commercialIntent: "creative_crew_support" })).toBeNull();
    for (const st of ["booked", "in_progress", "completed", "closed"]) expect(receiptSchedulingNote({ ...i, crmStage: st })).toBeNull();
  });
});
