import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./pricingPersistence", () => ({ convertToQuotation: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/commercial/clientQuotations", () => ({ createClientQuotation: vi.fn() }));

import { conversionFacts, conversionNext, conversionNotice, NOT_CREATED, type ExistingConversion } from "./conversionNotice";

const draft: ExistingConversion = { quotationId: "900f800c-51b5-4e4b-841b-0c9fe94bd950", quotationReference: "ORD-QUO-2026-000006", version: 1, status: "draft", currency: "USD", total: 351, issuedAt: null, acceptedAt: null };

describe("conversion feedback wording", () => {
  it("a successful creation is a clear success that says what was NOT done", () => {
    const n = conversionNotice({ ok: true, kind: "created", reference: "ORD-QUO-2026-000006", message: "" }, null)!;
    expect(n.tone).toBe("success");
    expect(n.title).toBe("Draft quotation created");
    expect(n.body).toContain("ORD-QUO-2026-000006");
    expect(n.body).toContain(NOT_CREATED);
    expect(NOT_CREATED).toMatch(/does not issue or email the quotation, record client acceptance, set an amount due, or create a booking, payment, receivable or revenue/);
  });
  it("an already-existing draft is explained as FOUND with no duplicate, not as a creation", () => {
    const n = conversionNotice({ ok: true, kind: "found", reference: "ORD-QUO-2026-000006", message: "" }, draft)!;
    expect(n.tone).toBe("info");
    expect(n.title).toBe("A quotation already exists for this enquiry");
    expect(n.body).toMatch(/found and no duplicate was created/);
  });
  it("a failure says nothing was created and that retrying is safe", () => {
    const n = conversionNotice({ ok: false, message: "Save the communicated price first." }, null)!;
    expect(n.tone).toBe("error");
    expect(n.body).toMatch(/Nothing was created.*never create a second quotation/);
  });
  it("looking at an existing draft later (no action this visit) still explains it; nothing before a price", () => {
    expect(conversionNotice(null, draft)!.title).toBe("Draft quotation on this enquiry");
    expect(conversionNotice(null, null)).toBeNull();
  });
  it("facts and next step: reference, version, status, amount, issued No, acceptance Not yet", () => {
    expect(conversionFacts(draft)).toEqual([
      { label: "Reference", value: "ORD-QUO-2026-000006" }, { label: "Version", value: "1" }, { label: "Status", value: "Draft" }, { label: "Amount", value: "USD 351.00" },
      { label: "Issued or sent", value: "No" }, { label: "Client acceptance", value: "Not yet" },
    ]);
    expect(conversionNext(draft)).toMatch(/issue it from the quotation page/);
    expect(conversionFacts({ ...draft, status: "sent", issuedAt: "2026-10-26T00:00:00Z" })[4].value).toBe("Yes");
  });
});

describe("the conversion panel (server-rendered markup)", () => {
  it("with no draft: one clearly labelled button, no quotation facts", async () => {
    const { default: Panel } = await import("../../app/admin/enquiries/[id]/ConvertPanel");
    const html = renderToStaticMarkup(createElement(Panel, { enquiryId: "e1", existing: null }));
    expect(html).toContain("Proceed to quotation");
    expect(html).toContain("pressing it again never makes a second one");
    expect(html).not.toContain("View draft quotation");
    expect(html).toContain('aria-live="polite"');
  });
  it("with a draft: facts, the next step, a direct 'View draft quotation' link, and NO create button", async () => {
    const { default: Panel } = await import("../../app/admin/enquiries/[id]/ConvertPanel");
    const html = renderToStaticMarkup(createElement(Panel, { enquiryId: "e1", existing: draft }));
    for (const t of ["ORD-QUO-2026-000006", "USD 351.00", "Draft", "Issued or sent", "Not yet", "Next:"]) expect(html).toContain(t);
    expect(html).toContain('href="/admin/pricing/quotations/900f800c-51b5-4e4b-841b-0c9fe94bd950"');
    expect(html).toContain("View draft quotation");
    expect(html).not.toContain("Proceed to quotation");
    expect(html).toContain("min-h-11");   // comfortable touch target on iPad / phone
  });
});
