import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Enquiry-to-booking M2a — what staff actually SEE in the "Quotation and amount due" panel, rendered to static HTML (no database, no browser). The repository has no
// component-test tooling by design, so this renders the real components on the server with the server actions stubbed out.
vi.mock("./amountDueActions", () => ({ establishAmountDueAction: vi.fn(), overrideAmountDueAction: vi.fn(), attachQuotationAction: vi.fn() }));

import QuotationAmountPanel from "./QuotationAmountPanel";
import type { AmountDuePanel } from "@/lib/commercial/amountDue";

const base: AmountDuePanel = {
  enquiry: { id: "e1", reference: "ENQ-2026-000042", paymentCountry: "GH", isCrewSupport: false, amountDue: null, amountDueSource: null, amountDueQuotationId: null, amountPaid: null },
  activeQuotation: null,
  history: [],
  attachable: [],
  entityRecorded: false,
  marketCurrency: "GHS",
  assessment: { canEstablish: false, blockers: [{ code: "no_quotation", message: "There is no active quotation for this enquiry. Create or attach one first." }], preview: null },
  directoryMismatch: false,
  events: [],
  viewer: { isSuperAdmin: false },
};
const accepted = { id: "q1", reference: "ORD-QUO-2026-000009", status: "accepted", version: 2, currency: "GHS", total: 1108.98, acceptedAt: "2026-10-19T10:00:00Z", acceptedVia: "staff_recorded", usdTotal: null, fxLockedAt: null };
const html = (p: AmountDuePanel) => renderToStaticMarkup(createElement(QuotationAmountPanel, { panel: p }));

describe("the panel", () => {
  it("a Crew Support enquiry shows only a pointer to the Crew Support request: no forms", () => {
    const out = html({ ...base, enquiry: { ...base.enquiry, isCrewSupport: true } });
    expect(out).toContain("managed from the Crew Support request");
    expect(out).not.toContain("<form");
  });
  it("with no quotation: offers to create one for this enquiry (carrying its id), or attach one; nothing to establish", () => {
    const out = html({ ...base, attachable: [{ id: "q9", reference: "ORD-QUO-2026-000001", status: "draft", currency: "USD", total: 10, party: "A Prospect" }] });
    expect(out).toContain("/admin/pricing/quotations/new?enquiryId=e1");
    expect(out).toContain("Attach an existing quotation");
    expect(out).toContain("ORD-QUO-2026-000001");
    expect(out).toContain("No active quotation is linked to this enquiry.");
    expect(out).not.toContain("Establish amount due");
  });
  it("an accepted quotation with a clean assessment shows the USD amount, the rate with its date, age and note, the payment-time caveat, and the establish button", () => {
    const out = html({
      ...base,
      activeQuotation: accepted,
      entityRecorded: true,
      assessment: { canEstablish: true, blockers: [], preview: { usdAmount: 100, rateToUsd: 11.0898, rateEffectiveFrom: "2026-10-10T09:00:00+00:00", rateAgeDays: 10, rateNote: "BoG mid-rate", rateAlreadyLocked: false, rateJump: null, noop: false } },
    });
    expect(out).toContain("ORD-QUO-2026-000009");
    expect(out).toContain("USD 100.00");
    expect(out).toContain("1 USD = 11.0898 GHS");
    expect(out).toContain("10 days old");
    expect(out).toContain("BoG mid-rate");
    expect(out).toContain("can differ slightly from the quoted total");
    expect(out).toContain("does not send an email, change the stage, or create a booking, payment or obligation");
    expect(out).toContain("Establish amount due");
    expect(out).toContain('name="expectedRateToUsd"');
  });
  it("a rate that moved more than 10% needs an acknowledgement tick", () => {
    const out = html({ ...base, activeQuotation: accepted, entityRecorded: true, assessment: { canEstablish: true, blockers: [], preview: { usdAmount: 85.5, rateToUsd: 13, rateEffectiveFrom: "2026-10-18T09:00:00+00:00", rateAgeDays: 1, rateNote: "x", rateAlreadyLocked: false, rateJump: { previousRateToUsd: 11, changePercent: 18.2 }, noop: false } } });
    expect(out).toContain('name="acknowledgeRateJump"');
    expect(out).toContain("moved 18.2%");
  });
  it("when blocked it lists the plain reasons and offers no establish button", () => {
    const out = html({ ...base, activeQuotation: { ...accepted, status: "sent", acceptedAt: null, acceptedVia: null }, assessment: { canEstablish: false, blockers: [{ code: "quotation_not_accepted", message: "The quotation has not been accepted. Record the client's acceptance with its evidence first." }], preview: null } });
    expect(out).toContain("has not been accepted");
    expect(out).toContain("A Super Admin must choose it before acceptance can be recorded");
    expect(out).not.toContain("Establish amount due</button>");
  });
  it("already established: says so and offers no second button", () => {
    const out = html({ ...base, enquiry: { ...base.enquiry, amountDue: 100, amountDueQuotationId: "q1", amountDueSource: "accepted_quotation" }, activeQuotation: { ...accepted, fxLockedAt: "2026-10-20T00:00:00Z", usdTotal: 100 }, entityRecorded: true, assessment: { canEstablish: true, blockers: [], preview: { usdAmount: 100, rateToUsd: 11.0898, rateEffectiveFrom: null, rateAgeDays: null, rateNote: "rate already locked on the quotation", rateAlreadyLocked: true, rateJump: null, noop: true } } });
    expect(out).toContain("Established from this quotation: USD 100.00");
    expect(out).toContain("Already established. Nothing to do.");
    expect(out).not.toContain(">Establish amount due<");
  });
  it("the override form appears only for a Super Admin, with category, reason, evidence and the typed reference", () => {
    expect(html(base)).not.toContain("override the amount due");
    const out = html({ ...base, viewer: { isSuperAdmin: true } });
    expect(out).toContain("Super Admin: override the amount due");
    for (const n of ["newAmountUsd", "category", "reason", "evidence", "typedReference"]) expect(out).toContain(`name="${n}"`);
    expect(out).toContain("Type ENQ-2026-000042 to confirm");
  });
  it("shows quotation history and the amount-due record with before and after values, the reason and the actor", () => {
    const out = html({
      ...base,
      history: [{ id: "q0", reference: "ORD-QUO-2026-000008", version: 1, status: "superseded", currency: "GHS", total: 1000, supersedesId: null, createdAt: "2026-10-18T00:00:00Z" }],
      events: [{ id: "ev1", enquiryId: "e1", enquiryReference: "ENQ-2026-000042", kind: "override", quotationReference: null, amountBefore: 100, sourceBefore: "accepted_quotation", amountAfter: 120, sourceAfter: "manual", quotationCurrency: null, quotationTotal: null, fxRateToUsd: null, fxRateEffectiveFrom: null, fxRateNote: null, category: "scope_or_price_change_agreed", reason: "Client agreed an extra location in writing", evidenceReference: "Email 2026-10-20", actorLabel: "ORD-0001 — A Super Admin", createdAt: "2026-10-20T10:00:00Z" }],
    });
    expect(out).toContain("v1 · superseded");
    expect(out).toContain("USD 100.00 (accepted quotation)");
    expect(out).toContain("USD 120.00 (manual)");
    expect(out).toContain("Scope or price change agreed in writing");
    expect(out).toContain("Evidence: Email 2026-10-20");
    expect(out).toContain("ORD-0001 — A Super Admin");
  });
  it("warns, without changing anything, when the quotation and enquiry point to different directory contacts", () => {
    expect(html({ ...base, activeQuotation: accepted, directoryMismatch: true })).toContain("different directory contacts");
  });
});
