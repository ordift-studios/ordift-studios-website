import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { realEmailsOf } from "@/lib/directory/contactability";
import { placeholderEmailFor } from "@/lib/shared/email/placeholder";

// "Proceed to quotation" used to copy the enquiry's email into the quotation's prospect_email. For an enquiry a staff member recorded without an address that email is the reserved
// placeholder '<reference>@no-email.invalid', which is not an address: it must never be stored on a quotation (it could surface on the quotation record, in exports or in a send).
describe("a placeholder email never becomes a quotation's prospect email", () => {
  it("the conversion filters the enquiry's email through realEmailsOf", () => {
    const src = readFileSync(new URL("./pricingPersistence.ts", import.meta.url), "utf8");
    expect(src).toContain("prospectEmail: realEmailsOf([enq.email as string | null])[0] ?? null");
    expect(src).not.toContain("prospectEmail: (enq.email as string | null) ?? null");
  });
  it("the placeholder, a blank and null all become 'no email'; a real address is kept as typed", () => {
    expect(realEmailsOf([placeholderEmailFor("ENQ-2026-000010")])[0] ?? null).toBeNull();
    expect(realEmailsOf([""])[0] ?? null).toBeNull();
    expect(realEmailsOf([null])[0] ?? null).toBeNull();
    expect(realEmailsOf(["client@example.com"])[0]).toBe("client@example.com");
  });
});
