import { describe, expect, it } from "vitest";
import { nextActionFor, quotationLine, summariseWorkflow, type QuotationFact, type WorkflowFacts } from "./workflowSummary";

// The QA case: a DRAFT quotation exists. Drafting must never read as issuing, and must never set an amount due, booking or payment.
const facts = (over: Partial<WorkflowFacts> = {}): WorkflowFacts => ({ stage: "new_lead", sourceChannel: "other", receivedAt: "2026-10-25T09:20:00Z", submittedAt: "2026-10-25T09:20:00Z", staffRecorded: false, commercialIntent: "ordift_led", amountDue: null, amountDueSource: null, amountPaid: null, paymentStatus: null, paymentCountry: "GH", quotations: [], contractingEntity: "hidden", emailsSuppressed: true, ...over });
const quote = (over: Partial<QuotationFact> = {}): QuotationFact => ({ id: "900f800c-51b5-4e4b-841b-0c9fe94bd950", version: 1, reference: "ORD-QUO-2026-000006", status: "draft", issuedAt: null, acceptedAt: null, acceptedVia: null, acceptanceChannel: null, acceptedByName: null, currency: "USD", total: 351, isTest: false, ...over });
const step = (r: ReturnType<typeof summariseWorkflow>, key: string) => r.steps.find((s) => s.key === key)!;

describe("a draft quotation is shown as created, not issued", () => {
  const r = summariseWorkflow(facts({ quotations: [quote()] }));
  it("says the draft exists, with reference, version, amount, currency and status, and links to it", () => {
    expect(step(r, "draft")).toMatchObject({ state: "done", answer: "Yes", href: "/admin/pricing/quotations/900f800c-51b5-4e4b-841b-0c9fe94bd950", hrefLabel: "View draft quotation" });
    expect(step(r, "draft").detail).toBe("ORD-QUO-2026-000006 · version 1 · USD 351.00 · Draft");
  });
  it("says it has NOT been issued or sent, and the client cannot have accepted it", () => {
    expect(step(r, "quotation")).toMatchObject({ state: "pending", answer: "No", label: "Quotation issued or sent" });
    expect(step(r, "quotation").detail).toMatch(/still a draft.*not been issued or sent.*client has not seen it/);
    expect(step(r, "acceptance").detail).toMatch(/has to be issued before the client can accept/);
  });
  it("a draft sets no amount due, booking or payment", () => {
    expect(step(r, "amount_due")).toMatchObject({ state: "pending" });
    expect(step(r, "amount_due").detail).toMatch(/draft quotation never creates one/);
    expect(step(r, "payment").state).toBe("pending");
    expect(step(r, "booking").state).toBe("pending");
  });
  it("tells the person the next required action and that nothing was sent", () => {
    expect(r.next).toMatch(/issue it from the quotation page/);
    expect(r.next).toMatch(/has not sent anything to the client/);
  });
});

describe("the other states stay accurate and separate", () => {
  it("no quotation: draft No, next action is to save the price and proceed", () => {
    const r = summariseWorkflow(facts());
    expect(step(r, "draft")).toMatchObject({ state: "pending", answer: "No" });
    expect(step(r, "quotation").answer).toBe("No");
    expect(r.next).toMatch(/Save the price you communicated/);
  });
  it("ready-but-not-issued is still not issued", () => {
    const r = summariseWorkflow(facts({ quotations: [quote({ status: "ready" })] }));
    expect(step(r, "quotation").answer).toBe("No");
    expect(step(r, "draft").detail).toMatch(/Ready \(reviewed, not issued\)/);
    expect(r.next).toMatch(/reviewed.*Issue it/);
  });
  it("issued: Yes, waiting for the client, acceptance still open", () => {
    const r = summariseWorkflow(facts({ stage: "quotation_sent", quotations: [quote({ status: "sent", issuedAt: "2026-10-26T08:00:00Z" })] }));
    expect(step(r, "quotation")).toMatchObject({ answer: "Yes", state: "current" });
    expect(step(r, "acceptance").state).toBe("current");
    expect(r.next).toMatch(/record the delivery/);          // delivery is a separate, person-recorded step
    const delivered = summariseWorkflow(facts({ stage: "quotation_sent", quotations: [quote({ status: "sent", issuedAt: "2026-10-26T08:00:00Z", validUntil: "2026-11-25" })], quotationDelivery: { channel: "whatsapp_message", deliveredAt: "2026-10-26T09:00:00Z" } }), "2026-10-27");
    expect(step(delivered, "delivery")).toMatchObject({ state: "done", answer: "Yes" });
    expect(delivered.next).toMatch(/Waiting for the client/);
  });
  it("accepted with no amount due: next is to establish it deliberately; acceptance is not a booking", () => {
    const r = summariseWorkflow(facts({ stage: "quotation_sent", quotations: [quote({ status: "accepted", issuedAt: "2026-10-26T08:00:00Z", acceptedAt: "2026-10-27T08:00:00Z", acceptedVia: "staff_recorded" })] }));
    expect(step(r, "acceptance").state).toBe("done");
    expect(step(r, "amount_due").state).toBe("pending");
    expect(step(r, "booking").state).toBe("pending");
    expect(r.next).toMatch(/Establish the amount due.*does not set it automatically/);
  });
  it("a superseded or declined quotation is not offered as the draft", () => {
    expect(step(summariseWorkflow(facts({ quotations: [quote({ status: "declined" })] })), "quotation").detail).toMatch(/was declined/);
    expect(nextActionFor(quote({ status: "declined" }))).toMatch(/closed/);
  });
  it("the one-line description is reusable and exact", () => expect(quotationLine(quote())).toBe("ORD-QUO-2026-000006 · version 1 · USD 351.00 · Draft"));
});
