import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/admin/pricing/quotations/actions", () => ({ issueQuotationAction: vi.fn(), recordQuotationAcceptanceAction: vi.fn(), recordQuotationDeliveryAction: vi.fn(), updateQuotationStatusAction: vi.fn() }));
vi.mock("@/components/admin/LocalDateTimeField", () => ({ default: ({ name }: { name: string }) => createElement("input", { name, type: "datetime-local" }) }));

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const issuance = code(read("./quotationIssuance.ts"));
const quotations = code(read("./clientQuotations.ts"));
const acceptance = code(read("./quotationAcceptance.ts"));

describe("issuing is a recorded, confirmed act: never a bare status flip, never sending, never money", () => {
  it("'sent' can no longer be set as a bare status change: it delegates to issuance", () => {
    const i = quotations.indexOf("export async function updateQuotationStatus");
    const body = quotations.slice(i, quotations.indexOf("export async function associateProspectQuotationWithClient"));
    expect(body).toMatch(/params\.status === "sent"[\s\S]*issueOrdinaryQuotation\(\{ quotationId: params\.quotationId \}\)/);
    expect(body.indexOf("issueOrdinaryQuotation")).toBeLessThan(body.indexOf('.update({ status: params.status })'));
  });
  it("one conditional write records status, issue time, issuer and validity together, and only for a still-draft, never-issued row", () => {
    expect(issuance).toMatch(/\.update\(\{ status: "sent", issued_at: issuedAt, issued_by: user\.id, valid_until: plan\.validUntil \}\)/);
    expect(issuance).toMatch(/\.eq\("status", "draft"\)\.is\("issued_at", null\)/);
  });
  it("it audits who, when, the approved validity, any exception and its approver, and states that nothing was sent", () => {
    for (const t of ["client_quotation.issued", "issuedAt", "validUntil: plan.validUntil", "standardValidUntil", "withinStandardPolicy", "exceptionReason", "approvedBy: user.id", "not sent by the system"]) expect(issuance).toContain(t);
  });
  it("it sends nothing and creates nothing financial: no email, notification, payment, booking, amount due or acceptance", () => {
    expect(issuance).not.toMatch(/sendEmail\(|sendQuotation|dispatch\w*\(|resend|\.from\("(payments|payment_obligations|engagements|enquiries)"\)|amount_due|accepted_at|accepted_via|crm_stage|establish_enquiry_amount_due/i);
    for (const imp of [...read("./quotationIssuance.ts").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])) expect(imp).not.toMatch(/email|notification|payments|crewSupport/i);
  });
  it("only an admin or Super Admin; Crew Support quotations are refused", () => {
    expect(issuance).toMatch(/hasRole\(user, "admin"\) && !isSuperAdmin\(user\)/);
    expect(issuance).toContain("crewManaged: Boolean(q.crew_support_request_id)");
  });
  it("delivery is a person's record (an audit event): it changes nothing on the quotation and is refused before issue", () => {
    const d = issuance.slice(issuance.indexOf("export async function recordQuotationDelivery"));
    expect(d).not.toMatch(/\.update\(/);
    expect(d).toContain('q.status !== "sent" && q.status !== "accepted"');
    expect(d).toContain("the system did not send anything");
  });
});

describe("expiry is enforced for staff-recorded acceptance and the client-portal acceptance", () => {
  it("staff acceptance refuses an acceptance received after the validity date", () => {
    expect(acceptance).toMatch(/acceptanceExpiryRefusal\(q\.valid_until, checked\.receivedAtIso\)/);
    expect(acceptance.indexOf("acceptanceExpiryRefusal(")).toBeLessThan(acceptance.indexOf('.update({'));
  });
  it("the only client-portal acceptance path (Crew Support quotations) already checks the validity date at the moment of acceptance", () => {
    const c = code(read("../crewSupport/quotation.ts"));
    const i = c.indexOf("export async function acceptQuotationAsClient");
    expect(c.slice(i, i + 900)).toMatch(/validateAcceptance\(\{ status: quote\.status, validUntil: quote\.validUntil/);
    expect(c).toMatch(/\.not\("crew_support_request_id", "is", null\)\.in\("status", \["sent", "accepted"\]\)/);   // ordinary quotations have no client-portal acceptance
  });
  it("a revision stays ONE atomic database call; its carried date is handled at issuance, never silently kept", () => {
    const i = quotations.indexOf("export async function reviseClientQuotation");
    const body = quotations.slice(i, quotations.indexOf("export async function attachQuotationToEnquiry"));
    expect(body).toMatch(/rpc\("revise_ordinary_quotation"/);
    expect(body).not.toMatch(/\.(insert|update|delete)\(/);
  });
});

const baseProps = { quotationId: "q1", hasClient: false, today: "2026-10-26", defaultValidUntil: "2026-11-25", currentValidUntil: null as string | null, isSuperAdmin: false, blockers: [] as string[], expired: false, deliveredText: null as string | null };
async function render(over: Partial<typeof baseProps> & { status: string }) {
  const { QuotationStatusActions } = await import("../../app/admin/pricing/quotations/[id]/QuotationStatusActions");
  return renderToStaticMarkup(createElement(QuotationStatusActions, { ...baseProps, ...over }));
}

describe("the issuance panel (server-rendered markup)", () => {
  it("a draft: 'Issue quotation' with a required confirmation, the standard validity and a clear no-email statement; no 'Mark Sent'", async () => {
    const html = await render({ status: "draft" });
    expect(html).toContain("Issue quotation");
    expect(html).not.toContain("Mark Sent");
    expect(html).toContain("Draft (not issued)");
    expect(html).toContain("It does not email or notify the client");
    expect(html).toMatch(/name="confirm"[^>]*required|required[^>]*name="confirm"/);
    expect(html).toContain('value="2026-11-25"');
    expect(html).toContain("standard: 30 calendar days from issue = 25 Nov 2026");
    expect(html).not.toContain("exceptionReason");                    // no exception field while the date is the standard one
    expect(html).toContain("min-h-11");
  });
  it("an exception date shows the reason field; beyond 30 days it explains who may approve", async () => {
    const admin = await render({ status: "draft", currentValidUntil: "2026-12-31" });
    expect(admin).toContain("exceptionReason");
    expect(admin).toMatch(/Only a Founder \/ Super Admin can approve it/);
    const sa = await render({ status: "draft", currentValidUntil: "2026-12-31", isSuperAdmin: true });
    expect(sa).toMatch(/As a Super Admin you may approve it; the reason is recorded/);
    const shorter = await render({ status: "draft", currentValidUntil: "2026-11-10" });
    expect(shorter).toMatch(/A different validity period is an exception/);
  });
  it("a date that has already passed is not offered: the default is pre-filled instead", async () => {
    expect(await render({ status: "draft", currentValidUntil: "2026-10-12" })).toContain('value="2026-11-25"');
  });
  it("prerequisite blockers are shown", async () => {
    expect(await render({ status: "draft", blockers: ["Add at least one line item before issuing."] })).toContain("Add at least one line item before issuing.");
  });
  it("an issued quotation: delivery is a separate recorded step, acceptance is available, no issue button", async () => {
    const html = await render({ status: "sent", currentValidUntil: "2026-11-25" });
    expect(html).not.toContain("Issue quotation");
    expect(html).toContain("Delivery to the client");
    expect(html).toContain("Issuing did not email or notify the client");
    expect(html).toContain("Record that I delivered it");
    expect(html).toContain("Record acceptance (with evidence)");
    expect(html).toContain("An acceptance received after the validity date cannot be recorded");
  });
  it("an expired quotation: no acceptance form, a clear reason and the way forward", async () => {
    const html = await render({ status: "sent", expired: true, currentValidUntil: "2026-10-20" });
    expect(html).not.toContain("Record acceptance (with evidence)");
    expect(html).toMatch(/expired, so acceptance cannot be recorded.*Revise/);
  });
  it("a recorded delivery is shown as recorded by staff", async () => {
    expect(await render({ status: "sent", deliveredText: "Delivered via WhatsApp message on 26 Oct 2026 (recorded by staff; the system sent nothing)" })).toContain("Delivered via WhatsApp message on 26 Oct 2026");
  });
});

describe("the dates card", () => {
  const card = async (o: { issuedAt: string | null; validUntil: string | null; status: string; today?: string }) => {
    const { default: Card } = await import("../../app/admin/pricing/quotations/[id]/QuotationDatesCard");
    return renderToStaticMarkup(createElement(Card, { createdAt: "2026-10-25T09:57:14Z", deliveryText: "d", acceptanceText: "a", today: "2026-10-26", ...o }));
  };
  it("a draft: prominent DRAFT indicator, Created date, 'Not yet issued', validity set at issue", async () => {
    const html = await card({ issuedAt: null, validUntil: null, status: "draft" });
    expect(html).toContain("Draft — not yet issued");
    expect(html).toContain("Created on");
    expect(html).toContain("25 Oct 2026");
    expect(html).toContain("Not yet issued");
    expect(html).toMatch(/Set when issued \(30 calendar days from the issue date\)/);
  });
  it("an issued quotation shows its real issue date and validity; an expired one is flagged", async () => {
    const ok = await card({ issuedAt: "2026-10-26T09:30:00Z", validUntil: "2026-11-25", status: "sent" });
    expect(ok).toContain("26 Oct 2026"); expect(ok).toContain("25 Nov 2026"); expect(ok).not.toContain("Draft — not yet issued"); expect(ok).not.toContain("Expired — cannot be accepted");
    const old = await card({ issuedAt: "2026-10-01T09:30:00Z", validUntil: "2026-10-20", status: "sent" });
    expect(old).toContain("Expired — cannot be accepted"); expect(old).toContain("(expired)");
  });
  it("a draft whose carried validity has passed says the old date will not carry over", async () => {
    expect(await card({ issuedAt: null, validUntil: "2026-10-12", status: "draft" })).toMatch(/12 Oct 2026, has passed and will not be carried over/);
  });
});

describe("the preview / PDF header", () => {
  it("labels Created / Issued / Valid until, and a draft says so loudly (never an unlabelled date)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/portal/roles", () => ({ getCurrentUser: async () => ({ id: "u", roles: ["admin"] }), hasRole: () => true, isSuperAdmin: () => false }));
    vi.doMock("@/lib/crewSupport/quotation", () => ({ getCrewQuotationPrintExtras: async () => null }));
    vi.doMock("@/lib/commercial/clientQuotations", () => ({ getClientQuotation: async () => ({ id: "q1", quotationReference: "ORD-QUO-2026-000006", status: "draft", createdAt: "2026-10-25T09:57:14Z", issuedAt: null, validUntil: null, clientName: null, prospectName: "Test", prospectCompany: null, prospectEmail: null, prospectPhone: null, currency: "USD", subtotal: 351, discountTotal: 0, taxTotal: 0, total: 351, paymentBookingTerms: null, items: [] }) }));
    vi.doMock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("notFound"); } }));
    const { default: Page } = await import("../../app/admin/pricing/quotations/[id]/pdf/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "q1" }) }));
    expect(html).toContain("Created: 25 Oct 2026");
    expect(html).toContain("Issued: Not yet issued");
    expect(html).toMatch(/Valid until: Set when issued \(30 calendar days from the issue date\)/);
    expect(html).toContain("DRAFT — NOT YET ISSUED");
    expect(html).not.toMatch(/This quotation is valid until/);
  });
});
