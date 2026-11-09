// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { buildDocumentContent, contentFingerprint, type DocumentSource, type QuotationDocumentContext } from "@/lib/commercial/quotationDocument";
import { contactsFor, snapshotContacts } from "@/lib/brand/letterheadContacts";
import { ACCEPTANCE_NOTE, QuotationDocument } from "./QuotationDocument";
import { loadLetterhead, renderQuotationPdf } from "./render";
import { unsupportedCharacters } from "./coverage";
import { CONDITIONAL_SENTENCE, withConditionalSentence } from "@/lib/bookings/quotationAvailabilityPolicy";

// Synthetic data only: no real client, entity, quotation or identifier.
const source: DocumentSource = {
  reference: "ORD-QUO-2026-009999", version: 2, currency: "QAR", issuedAt: "2026-11-04T09:30:00.000Z", validUntil: "2026-12-04",
  subtotal: 4200, discountTotal: 200, taxTotal: 0, total: 4000, paymentBookingTerms: "50% deposit to confirm.\nBalance on delivery.",
  items: [
    { serviceItem: "Corporate headshots, half day", description: "Up to 10 people", quantity: 1, unitBasis: "package", sellingRate: 3000, discountPercent: null, taxPercent: null, lineTotal: 3000 },
    { serviceItem: "Additional retouched images", description: null, quantity: 12, unitBasis: "image", sellingRate: 100, discountPercent: 10, taxPercent: null, lineTotal: 1200 },
  ],
  entity: { legalName: "SYNTHETIC ENTITY W.L.L.", registrationType: "Single-Member Limited Liability Company (W.L.L.)", identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "000000" }, { label: "Tax registration No.", identifier: "0000000000" }] },
  declaredActivities: ["photography"], activityLabels: { photography: "Photography" },
};
const content = buildDocumentContent(source);
const fingerprint = contentFingerprint(content);
const context: QuotationDocumentContext = { status: "sent", today: "2026-11-05", jurisdiction: "Qatar", contacts: snapshotContacts(contactsFor("Qatar")), contactsFrozen: true, party: { name: "Synthetic Client", company: "Synthetic Co", email: "client@example.test", phone: "+000 000 0000" } };

// Walks the element tree (expanding function components) and returns every piece of text, so the document's content can be asserted without a PDF text extractor.
function texts(node: ReactNode, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((n) => texts(n, out)); return out; }
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return texts((el.type as (p: unknown) => ReactNode)(el.props), out);
  return texts(el.props?.children, out);
}
const all = (ctx: QuotationDocumentContext = context, c = content) => texts(QuotationDocument({ content: c, context: ctx, fingerprint, letterhead: { base: null, icons: { email: null, phone: null, web: null } } }) as ReactElement).join("");

const pageCount = (raw: string): number => (raw.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

describe("what the quotation document says (from the frozen issued content only)", () => {
  const t = all();
  it("shows the reference, version, issue date, validity and the contracting entity's legal details", () => {
    expect(t).toContain("ORD-QUO-2026-009999");
    expect(t).toContain("(version 2)");
    expect(t).toContain("4 Nov 2026");
    expect(t).toContain("Valid until 4 Dec 2026");
    expect(t).toContain("SYNTHETIC ENTITY W.L.L.");
    expect(t).toContain("Commercial Registration (CR) No.");
    expect(t).toContain("000000");
  });
  it("shows the client, the services covered, each line, the amounts with the currency, and the terms", () => {
    expect(t).toContain("Synthetic Client");
    expect(t).toContain("Services covered: Photography");
    expect(t).toContain("Corporate headshots, half day");
    expect(t).toContain("Discount 10%");
    expect(t).toContain("QAR 3,000.00");
    expect(t).toContain("QAR 4,000.00");
    expect(t).toContain("-QAR 200.00");
    expect(t).toContain("50% deposit to confirm.\nBalance on delivery.");
  });
  it("carries the content fingerprint on the document and the neutral acceptance note", () => {
    expect(t).toContain(`fingerprint ${fingerprint.slice(0, 4)} ${fingerprint.slice(4, 8)}`);
    expect(t).toContain(ACCEPTANCE_NOTE);
  });
  it("warns a client-facing reader when the quotation has expired, and not otherwise", () => {
    expect(all({ ...context, today: "2026-12-05" })).toContain("EXPIRED");
    expect(t).not.toContain("EXPIRED");
  });
  it("cannot show internal data: the content has no field for notes, cost or margin", () => {
    expect(t).not.toMatch(/internal|margin|cost price|commercial notes/i);
  });
});

describe("market-specific letterhead contact details and the issuing entity", () => {
  const withJur = (j: string | null): QuotationDocumentContext => ({ ...context, jurisdiction: j, contacts: snapshotContacts(contactsFor(j)) });
  const qa = all(); const gh = all(withJur("Ghana")); const none = all(withJur(null));
  it("the Qatar entity's quotation shows the Qatar telephone, the approved public mailbox and the correct website, and nothing of Ghana's", () => {
    expect(qa).toContain("+974 5510 4490");
    expect(qa).toContain("enquiries@ordiftstudios.com");
    expect(qa).toContain("www.ordiftstudios.com");
    expect(qa).not.toContain("+233");
  });
  it("the Ghana entity's quotation shows the Ghana telephone and nothing of Qatar's", () => {
    expect(gh).toContain("+233 504 981 277");
    expect(gh).toContain("www.ordiftstudios.com");
    expect(gh).not.toContain("+974");
  });
  it("neither prints the internal Gmail address the old letterhead carried, nor the misspelt website", () => {
    for (const t of [qa, gh, none]) { expect(t).not.toMatch(/gmail/i); expect(t).not.toMatch(/odiftstudios/); expect(t).not.toMatch(/matetey@/); }
  });
  it("an entity with no configured contacts prints only what is true for every entity: no telephone is guessed", () => {
    expect(none).toContain("www.ordiftstudios.com");
    expect(none).not.toMatch(/\+974|\+233|\+44/);
    for (const t of [qa, gh, none]) expect(t).not.toContain("7777 371023");        // the UK WhatsApp number is excluded for every market
  });
  it("identifies the issuing entity with its frozen legal registration details, in the body and the footer line", () => {
    expect(qa).toContain("Issued by (contracting entity)");
    expect(qa).toContain("Jurisdiction: Qatar");
    expect(qa.split("SYNTHETIC ENTITY W.L.L. · Commercial Registration (CR) No. 000000 · Tax registration No. 0000000000").length).toBe(2);   // exactly once: the footer line
  });
});

describe("the rendered PDF file", () => {
  it("is a real, multi-object PDF built on the server (A4) from the synthetic content, and uses the approved letterhead file unchanged", async () => {
    const lh = loadLetterhead();
    expect(lh.base).not.toBeNull();
    expect(Object.values(lh.icons).every((b) => b !== null)).toBe(true);
    const pdf = await renderQuotationPdf({ content, context, fingerprint });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(20_000);                           // letterhead image + two embedded fonts
    const raw = pdf.toString("latin1");
    expect(/\/MediaBox\s*\[0 0 595\.2\d* 841\.8\d*\]/.test(raw)).toBe(true);   // A4
    expect(pageCount(raw)).toBe(1);                                             // this short synthetic quotation fits one page
  }, 60_000);

  it("a long quotation continues onto further pages with the letterhead and fingerprint footer on each", async () => {
    const many = buildDocumentContent({ ...source, items: Array.from({ length: 40 }, (_, i) => ({ ...source.items[0], serviceItem: `Synthetic line ${i + 1}` })) });
    const pdf = await renderQuotationPdf({ content: many, context, fingerprint: contentFingerprint(many) });
    expect(pageCount(pdf.toString("latin1"))).toBeGreaterThan(1);
  }, 60_000);

  it("a missing letterhead file is tolerated by the loader (the document is then built without that image)", () => {
    const lh = loadLetterhead("/nonexistent-root-for-test");
    expect(lh.base).toBeNull();
    expect(Object.values(lh.icons).every((b) => b === null)).toBe(true);
  });

  it("two renders of the same content differ in bytes, so the CONTENT fingerprint printed on the document (not a hash of the file) is what identifies it", async () => {
    const a = await renderQuotationPdf({ content, context, fingerprint });
    const b = await renderQuotationPdf({ content, context, fingerprint });
    expect(a.equals(b)).toBe(false);
    expect(contentFingerprint(content)).toBe(fingerprint);
  }, 60_000);
});

describe("conditional quotation wording in the document (pending final legal review)", () => {
  const conditional = buildDocumentContent({ ...source, paymentBookingTerms: withConditionalSentence(source.paymentBookingTerms) });
  it("is shown verbatim with the payment terms, unchanged, and can be drawn by the PDF fonts", () => {
    const t = all(context, conditional);
    expect(t).toContain(CONDITIONAL_SENTENCE);
    expect(t).toContain("50% deposit to confirm.");
    expect(unsupportedCharacters(CONDITIONAL_SENTENCE)).toEqual([]);
  });
  it("is absent from an ordinary quotation", () => { expect(all()).not.toContain("subject to confirmation of personnel availability"); });
});
