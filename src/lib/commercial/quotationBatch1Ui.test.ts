import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/admin/pricing/quotations/actions", () => ({ issueQuotationAction: vi.fn(), recordQuotationAcceptanceAction: vi.fn(), recordQuotationDeliveryAction: vi.fn(), updateQuotationStatusAction: vi.fn() }));
vi.mock("../../app/admin/organisations/contractingActions", () => ({ chooseOrdinaryContractingEntityAction: vi.fn() }));
vi.mock("@/components/admin/LocalDateTimeField", () => ({ default: ({ name }: { name: string }) => createElement("input", { name, type: "datetime-local" }) }));

const FP = "0123456789abcdef".repeat(4);
const props = { quotationId: "q1", hasClient: false, today: "2026-11-05", defaultValidUntil: "2026-12-05", currentValidUntil: "2026-12-04", isSuperAdmin: false, blockers: [] as string[], expired: false, deliveredText: null as string | null, status: "sent" };
async function status(over: Record<string, unknown> = {}) {
  const { QuotationStatusActions } = await import("../../app/admin/pricing/quotations/[id]/QuotationStatusActions");
  return renderToStaticMarkup(createElement(QuotationStatusActions, { ...props, ...over }));
}

describe("the delivery form (manual: the system sends nothing)", () => {
  it("offers recipient and evidence fields and a ticked 'I sent the system PDF' box carrying the fingerprint, plus a download link", async () => {
    const html = await status({ documentFingerprint: FP, documentHref: "/admin/pricing/quotations/q1/document?download=1" });
    expect(html).toContain('name="recipient"');
    expect(html).toContain('name="evidence"');
    expect(html).toMatch(/name="sentSystemPdf"[^>]*checked/);
    expect(html).toContain(`name="pdfFingerprint" value="${FP}"`);
    expect(html).toContain("0123 4567 89ab cdef");
    expect(html).toContain('href="/admin/pricing/quotations/q1/document?download=1"');
    expect(html).toMatch(/The system sends nothing/);
  });
  it("without an available PDF (changed content or none built) it claims no fingerprint and shows no download link", async () => {
    const html = await status({ documentFingerprint: null, documentHref: null });
    expect(html).not.toContain('name="sentSystemPdf"');
    expect(html).not.toContain('name="pdfFingerprint"');
    expect(html).not.toContain("/document?download=1");
    expect(html).toContain('name="recipient"');
  });
  it("is not shown for a draft", async () => {
    const html = await status({ status: "draft", documentFingerprint: FP });
    expect(html).not.toContain('name="sentSystemPdf"');
  });
});

describe("the contracting entity form: a suggestion, never a preselection", () => {
  const options = [{ entityId: "g", name: "Ordift Studios (Ghana)", eligible: true, blockers: [] }, { entityId: "q", name: "Ordift Studios (Qatar) (Qatar)", eligible: true, blockers: [] }];
  async function form(suggestion: unknown) {
    const { default: Form } = await import("../../app/admin/organisations/ContractingEntityForm");
    return renderToStaticMarkup(createElement(Form, { subjectType: "quotation", subjectId: "q1", options, suggestion } as never));
  }
  it("shows the suggestion text and a 'use this suggestion' button, with no entity selected and the reason still required", async () => {
    const html = await form({ entityId: "q", text: "This enquiry's payment market is Qatar, so Ordift Studios (Qatar) is suggested. A Super Admin must confirm it below; it is not recorded automatically.", usable: true });
    expect(html).toContain("A Super Admin must confirm it below");
    expect(html).toContain("Use this suggestion (you still confirm below)");
    expect(html).not.toMatch(/<option[^>]*value="[^"]+"[^>]*selected|<option[^>]*selected[^>]*value="[^"]+"/);   // only the empty placeholder is selected
    expect(html).toMatch(/name="basis"[^>]*required|required=""[^>]*name="basis"/);
  });
  it("offers no button for an entity that cannot currently contract, and shows nothing when there is no suggestion", async () => {
    expect(await form({ entityId: "q", text: "cannot currently contract", usable: false })).not.toContain("Use this suggestion");
    expect(await form(null)).not.toContain("suggest");
  });
});
