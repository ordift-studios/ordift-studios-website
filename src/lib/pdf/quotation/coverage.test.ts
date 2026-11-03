// @vitest-environment node
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocumentContent, type QuotationDocumentContext } from "@/lib/commercial/quotationDocument";
import { contactsFor, snapshotContacts } from "@/lib/brand/letterheadContacts";
import { PDF_FONT_COVERAGE, findUnsupportedText, unsupportedCharacters, unsupportedMessage } from "./coverage";

// Synthetic data only (the Arabic text is made-up names).
const ARABIC_NAME = "محمد أحمد العلي";
const content = (over: Record<string, unknown> = {}) => buildDocumentContent({
  reference: "ORD-QUO-2026-009999", version: 1, currency: "QAR", issuedAt: "2026-11-04T09:30:00.000Z", validUntil: "2026-12-04", subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100, paymentBookingTerms: "Terms\nsecond line",
  items: [{ serviceItem: "Portrait session", description: "Up to 2 hours – studio", quantity: 1, unitBasis: "package", sellingRate: 100, discountPercent: null, taxPercent: null, lineTotal: 100 }],
  entity: { legalName: "SYNTHETIC ENTITY", registrationType: null, identifiers: [] }, declaredActivities: [], activityLabels: {}, ...over,
});
const ctx = (name: string | null): QuotationDocumentContext => ({ status: "sent", today: "2026-11-05", jurisdiction: "Qatar", contacts: snapshotContacts(contactsFor("Qatar")), contactsFrozen: true, party: { name, company: null, email: null, phone: null } });

const require = createRequire(import.meta.url);
const fontkit = require("fontkit") as { openSync: (p: string) => { characterSet: number[]; layout: (t: string) => { glyphs: { name: string; advanceWidth: number }[] } } };
const dir = path.join(process.cwd(), "public/fonts/pdf");
const open = (f: string) => fontkit.openSync(path.join(dir, `${f}.ttf`));
const commonTo = (files: string[]) => { const sets = files.map((f) => new Set(open(f).characterSet)); return new Set([...sets[0]].filter((cp) => sets.every((s) => s.has(cp)))); };

describe("the PDF font coverage table matches the embedded font files", () => {
  const inter = commonTo(["Inter-Regular", "Inter-Medium", "Inter-SemiBold"]);
  const arabic = commonTo(["IBMPlexSansArabic-Regular", "IBMPlexSansArabic-Medium", "IBMPlexSansArabic-SemiBold"]);
  const table = [...new Set(PDF_FONT_COVERAGE.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)))];
  it("claims nothing that the fonts lack: every code point in the table is in Inter's three weights or in the Arabic font's three weights", () => {
    expect(table.filter((cp) => !inter.has(cp) && !arabic.has(cp))).toEqual([]);
  });
  it("covers all printable ASCII and Latin-1, and the Arabic letters and Arabic-Indic digits", () => {
    const need = [...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => 0x20 + i), ...Array.from({ length: 0xff - 0xa0 + 1 }, (_, i) => 0xa0 + i), ...Array.from({ length: 0x64a - 0x621 + 1 }, (_, i) => 0x621 + i), ...Array.from({ length: 10 }, (_, i) => 0x660 + i)];
    expect(need.filter((cp) => !table.includes(cp))).toEqual([]);
  });
  it("refuses code points that neither font draws reliably: the NUL character, private-use characters and zero-width or direction marks", () => {
    for (const cp of [0x0, 0xe000, 0xefcc, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff]) expect(table).not.toContain(cp);
  });
  it("the Arabic font draws complete letters, not letters assembled from separate dot marks (the PDF renderer misplaces such marks: the reason Noto Sans Arabic was not used)", () => {
    for (const f of ["IBMPlexSansArabic-Regular", "IBMPlexSansArabic-Medium", "IBMPlexSansArabic-SemiBold"]) {
      const glyphs = open(f).layout("شركة العلي محمد أحمد يوسف ثقة").glyphs;
      expect(glyphs.filter((g) => g.advanceWidth === 0 && !/space|nbspace/i.test(g.name))).toEqual([]);   // no zero-width mark glyphs to position
    }
  });
});

describe("text the fonts cannot draw is reported, never silently replaced or dropped", () => {
  it("accepts ordinary Latin names, accents, the cedi and euro signs, dashes, curly quotes and line breaks", () => {
    expect(unsupportedCharacters("José Müller-Ålesund – Café ’quoted’ “ok” ₵ € • …\nline")).toEqual([]);
  });
  it("accepts Arabic names, mixed Arabic and English names, Arabic-Indic digits and Arabic punctuation", () => {
    expect(unsupportedCharacters(ARABIC_NAME)).toEqual([]);
    expect(unsupportedCharacters("Sara Ahmed سارة أحمد (Doha)")).toEqual([]);
    expect(unsupportedCharacters("حتى ١٠ أشخاص، مع ٥٠٪ دفعة؟")).toEqual([]);
  });
  it("flags scripts the fonts do not have, and zero-width and direction marks", () => {
    expect(unsupportedCharacters("张伟")).toHaveLength(2);
    expect(unsupportedCharacters("Имя")).toHaveLength(3);
    expect(unsupportedCharacters("a\u200fb\u200dc")).toEqual(["\u200f", "\u200d"]);
  });
  it("finds which field of the document holds them without repeating the client's text", () => {
    const found = findUnsupportedText(content(), ctx("张伟"));
    expect(found).toEqual([{ field: "Client name", arabic: false, count: 2 }]);
    const msg = unsupportedMessage(found);
    expect(msg).toMatch(/was not generated/);
    expect(msg).toMatch(/Client name/);
    expect(msg).not.toContain("张伟");
  });
  it("finds them in the lines and terms too, and finds nothing in an ordinary or an Arabic document", () => {
    expect(findUnsupportedText(content(), ctx("Ama Mensah"))).toEqual([]);
    expect(findUnsupportedText(content({ paymentBookingTerms: "دفعة مقدمة", items: [{ serviceItem: "جلسة", description: null, quantity: 1, unitBasis: "package", sellingRate: 1, discountPercent: null, taxPercent: null, lineTotal: 1 }] }), ctx(ARABIC_NAME))).toEqual([]);
    const found = findUnsupportedText(content({ paymentBookingTerms: "文字", items: [{ serviceItem: "文字", description: null, quantity: 1, unitBasis: "package", sellingRate: 1, discountPercent: null, taxPercent: null, lineTotal: 1 }] }), ctx("Ama Mensah"));
    expect(found.map((f) => f.field)).toEqual(["Line 1 item", "Payment and booking terms"]);
  });
});
