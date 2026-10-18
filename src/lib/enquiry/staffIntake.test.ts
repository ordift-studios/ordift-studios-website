import { describe, expect, it } from "vitest";
import { validateStaffEnquiry, channelLabel, type StaffEnquiryInput } from "./staffIntake";
import { displayEmail, isPlaceholderEmail, placeholderEmailFor } from "@/lib/shared/email/placeholder";
import { normaliseEmail } from "@/lib/directory/emails";
import { summariseWorkflow, bookedOrLater, type WorkflowFacts } from "./workflowSummary";

const NOW = new Date("2026-10-20T12:00:00Z");
const base: StaffEnquiryInput = { service: "photography", channel: "whatsapp", receivedAt: "2026-10-19T09:00:00Z", fullName: "Test Person", email: "", phone: "0240000000", details: "", allowStatusEmails: false, now: NOW };

describe("validateStaffEnquiry", () => {
  it("accepts a phone-only WhatsApp enquiry and suppresses automatic emails by default", () => {
    const r = validateStaffEnquiry(base);
    expect(r).toMatchObject({ ok: true, value: { email: null, channel: "whatsapp", suppressEmails: true, service: "photography" } });
  });
  it("needs an email or a phone number", () => {
    expect(validateStaffEnquiry({ ...base, phone: "" }).ok).toBe(false);
    expect(validateStaffEnquiry({ ...base, phone: "", email: "client@example.com" }).ok).toBe(true);
  });
  it("rejects an invalid email or phone rather than guessing", () => {
    expect(validateStaffEnquiry({ ...base, email: "not-an-email" }).ok).toBe(false);
    expect(validateStaffEnquiry({ ...base, phone: "12" }).ok).toBe(false);
  });
  it("only allows the ordinary service pathways: Creative Crew Support has its own workflow", () => {
    expect(validateStaffEnquiry({ ...base, service: "crew-support" }).ok).toBe(false);
    expect(validateStaffEnquiry({ ...base, service: "nonsense" }).ok).toBe(false);
  });
  it("only allows a staff channel (the website channel is the public form)", () => {
    expect(validateStaffEnquiry({ ...base, channel: "website" }).ok).toBe(false);
    expect(validateStaffEnquiry({ ...base, channel: "in_person" }).ok).toBe(true);
  });
  it("refuses a future or very old contact time", () => {
    expect(validateStaffEnquiry({ ...base, receivedAt: "2026-10-21T12:00:00Z" }).ok).toBe(false);
    expect(validateStaffEnquiry({ ...base, receivedAt: "2024-01-01T00:00:00Z" }).ok).toBe(false);
    expect(validateStaffEnquiry({ ...base, receivedAt: "garbage" }).ok).toBe(false);
  });
  it("automatic status emails need a real email address", () => {
    expect(validateStaffEnquiry({ ...base, allowStatusEmails: true }).ok).toBe(false);
  });
  it("switches automatic emails on only when explicitly allowed", () => {
    expect(validateStaffEnquiry({ ...base, email: "client@example.com", allowStatusEmails: true })).toMatchObject({ ok: true, value: { suppressEmails: false } });
  });
  it("labels channels, including the unknown legacy case, without guessing", () => {
    expect(channelLabel("telephone")).toBe("Telephone");
    expect(channelLabel(null)).toMatch(/Website form/);
  });
});

describe("placeholder email", () => {
  it("is on a reserved domain, is recognised, is displayed as no email, and is never treated as an address", () => {
    const p = placeholderEmailFor("ENQ-2026-000010");
    expect(p).toBe("enq-2026-000010@no-email.invalid");
    expect(isPlaceholderEmail(p)).toBe(true);
    expect(isPlaceholderEmail("someone@example.com")).toBe(false);
    expect(displayEmail(p)).toBe("No email on file");
    expect(displayEmail("someone@example.com")).toBe("someone@example.com");
    expect(normaliseEmail(p)).toBeNull();
  });
});

const facts = (over: Partial<WorkflowFacts> = {}): WorkflowFacts => ({
  stage: "new_lead", sourceChannel: "telephone", receivedAt: "2026-10-19T09:00:00Z", submittedAt: "2026-10-20T08:00:00Z", staffRecorded: true, commercialIntent: "ordift_led",
  amountDue: null, amountDueSource: null, amountPaid: null, paymentStatus: null, paymentCountry: null, quotations: [], contractingEntity: null, emailsSuppressed: true, ...over,
});
const quote = (status: string, over = {}) => ({ reference: "QT-1", status, issuedAt: "2026-10-20T10:00:00Z", acceptedAt: null, acceptedVia: null, acceptanceChannel: null, acceptedByName: null, currency: "GHS", total: 100, isTest: false, ...over });
const step = (r: ReturnType<typeof summariseWorkflow>, key: string) => r.steps.find((s) => s.key === key)!;

describe("summariseWorkflow keeps enquiry, quotation, acceptance and booking apart", () => {
  it("a fresh enquiry has nothing after the enquiry itself", () => {
    const r = summariseWorkflow(facts());
    expect(step(r, "enquiry").state).toBe("done");
    expect(["quotation", "acceptance", "amount_due", "payment", "booking"].map((k) => step(r, k).state)).toEqual(["pending", "pending", "pending", "pending", "pending"]);
    expect(r.notes.join(" ")).toMatch(/Automatic client emails are switched off/);
  });
  it("an issued quotation waits for the client", () => {
    const r = summariseWorkflow(facts({ stage: "quotation_sent", quotations: [quote("sent")] }));
    expect(step(r, "quotation").state).toBe("current");
    expect(step(r, "acceptance").state).toBe("current");
  });
  it("an accepted quotation is a recorded acceptance, not a booking, and does not set the amount due", () => {
    const r = summariseWorkflow(facts({ stage: "quotation_sent", quotations: [quote("accepted", { acceptedAt: "2026-10-21T09:00:00Z", acceptedVia: "staff_recorded", acceptanceChannel: "whatsapp_message", acceptedByName: "A Client" })] }));
    expect(step(r, "acceptance").state).toBe("done");
    expect(step(r, "acceptance").detail).toMatch(/not a booking/);
    expect(step(r, "amount_due").state).toBe("pending");
    expect(step(r, "booking").state).toBe("pending");
    expect(r.notes.join(" ")).toMatch(/does not set the amount due/);
  });
  it("shows the amount-due source and payment progress without changing either", () => {
    const part = summariseWorkflow(facts({ stage: "quotation_sent", amountDue: 200, amountDueSource: "manual", amountPaid: 50, paymentStatus: "Pending", paymentCountry: "QA" }));
    expect(step(part, "amount_due").detail).toMatch(/typed in by staff/);
    expect(step(part, "payment").state).toBe("current");
    const paid = summariseWorkflow(facts({ stage: "booked", amountDue: 200, amountPaid: 200, paymentStatus: "Paid" }));
    expect(step(paid, "payment").state).toBe("done");
  });
  it("booked keeps its existing meaning and an unexplained booked stage is described, not judged", () => {
    expect(bookedOrLater("booked")).toBe(true);
    expect(bookedOrLater("completed")).toBe(true);
    expect(bookedOrLater("quotation_sent")).toBe(false);
    expect(bookedOrLater("declined")).toBe(false);
    const r = summariseWorkflow(facts({ stage: "booked", staffRecorded: false, sourceChannel: null, emailsSuppressed: false }));
    expect(step(r, "booking").state).toBe("done");
    expect(r.notes.join(" ")).toMatch(/booked without a recorded quotation acceptance/);
  });
  it("shows the contracting entity only when it may be read, and says it is never inferred", () => {
    expect(summariseWorkflow(facts({ contractingEntity: "hidden" })).steps.some((s) => s.key === "entity")).toBe(false);
    const none = summariseWorkflow(facts({ contractingEntity: null }));
    expect(step(none, "entity")).toMatchObject({ state: "pending" });
    expect(step(none, "entity").detail).toMatch(/never inferred/);
    expect(step(summariseWorkflow(facts({ contractingEntity: { name: "Entity A", version: 1 } })), "entity").state).toBe("done");
  });
  it("points Crew Support enquiries to their own workflow", () => {
    expect(summariseWorkflow(facts({ commercialIntent: "creative_crew_support" })).notes.join(" ")).toMatch(/Crew Support/);
  });
});
