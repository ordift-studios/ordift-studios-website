import type { QuotationDocumentContent, QuotationDocumentContext } from "@/lib/commercial/quotationDocument";

// What the embedded PDF fonts can actually draw for text a person types: Inter (Latin subset) and, as the fallback for everything Inter lacks, IBM Plex Sans Arabic (src/lib/pdf/fonts.ts, BODY_FONT).
// A character neither font has would not be shown: react-pdf draws a garbled stand-in without any error (seen with an Arabic name before the Arabic font was added). Rather than let a client's
// name be silently garbled, replaced or dropped, the quotation PDF is NOT produced when any text on it needs a character outside this table, and the person is told which field and why.
// The table is deliberately CURATED: Latin and Latin Extended-A, common punctuation and currency signs, and the Arabic blocks, each restricted to code points that Inter's three weights or IBM Plex
// Sans Arabic's three weights (the weights the document uses) ALL contain. Format characters such as the zero-width and bidirectional marks are not in either font, so they are refused rather than
// risked. A test checks the table against the font files, so adding or changing a font cannot leave it claiming a character that is missing. (Fraunces draws only the fixed word "Quotation".)
export const PDF_FONT_COVERAGE: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], [0xa0, 0xff], [0x110, 0x110], [0x131, 0x133], [0x135, 0x135], [0x140, 0x142], [0x152, 0x153], [0x160, 0x161], [0x178, 0x178], [0x17d, 0x17e], [0x600, 0x604], [0x606, 0x61b], [0x61e, 0x6a1], [0x6a3, 0x6ff], [0x750, 0x77f], [0x8a0, 0x8a0], [0x8a2, 0x8ac], [0x8b3, 0x8b3], [0x8e4, 0x8fe], [0x2010, 0x2010], [0x2013, 0x2015], [0x2018, 0x201e], [0x2020, 0x2022], [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x20a1, 0x20a1], [0x20a4, 0x20a4], [0x20a6, 0x20a6], [0x20a8, 0x20ae], [0x20b1, 0x20b2], [0x20b4, 0x20b5], [0x20b8, 0x20ba], [0x20bd, 0x20bd], [0x20bf, 0x20bf], [0x2122, 0x2122], [0xfb51, 0xfb51], [0xfb53, 0xfb55], [0xfb57, 0xfb59], [0xfb5b, 0xfb5d], [0xfb5f, 0xfb61], [0xfb63, 0xfb65], [0xfb67, 0xfb69], [0xfb6b, 0xfb6d], [0xfb6f, 0xfb71], [0xfb73, 0xfb75], [0xfb77, 0xfb79], [0xfb7b, 0xfb7d], [0xfb7f, 0xfb81], [0xfb83, 0xfb83], [0xfb85, 0xfb85], [0xfb87, 0xfb87], [0xfb89, 0xfb89], [0xfb8b, 0xfb8b], [0xfb8d, 0xfb8d], [0xfb8f, 0xfb91], [0xfb93, 0xfb95], [0xfb97, 0xfb99], [0xfb9b, 0xfb9d], [0xfb9f, 0xfb9f], [0xfba1, 0xfba1], [0xfba5, 0xfba5], [0xfba7, 0xfba9], [0xfbab, 0xfbad], [0xfbaf, 0xfbaf], [0xfbb1, 0xfbc1], [0xfbd4, 0xfbd6], [0xfbd8, 0xfbd8], [0xfbda, 0xfbda], [0xfbdc, 0xfbdc], [0xfbdf, 0xfbdf], [0xfbe1, 0xfbe1], [0xfbe3, 0xfbe3], [0xfbe5, 0xfbe9], [0xfbfd, 0xfbff], [0xfc03, 0xfc04], [0xfc09, 0xfc0a], [0xfc0f, 0xfc10], [0xfc13, 0xfc14], [0xfc31, 0xfc32], [0xfc35, 0xfc36], [0xfc3d, 0xfc3e], [0xfc42, 0xfc44], [0xfc4f, 0xfc50], [0xfc59, 0xfc5d], [0xfc64, 0xfc65], [0xfc67, 0xfc6b], [0xfc6d, 0xfc71], [0xfc73, 0xfc77], [0xfc79, 0xfc7b], [0xfc83, 0xfc84], [0xfc8a, 0xfc8b], [0xfc8d, 0xfc92], [0xfc94, 0xfc96], [0xfccc, 0xfccc], [0xfcd9, 0xfcd9], [0xfcf2, 0xfcf4], [0xfcfb, 0xfcfe], [0xfd05, 0xfd08], [0xfd0d, 0xfd10], [0xfd17, 0xfd1a], [0xfd21, 0xfd24], [0xfd29, 0xfd2c], [0xfd3c, 0xfd3f], [0xfdf1, 0xfdf2], [0xfdf4, 0xfdf4], [0xfdfa, 0xfdfd], [0xfe70, 0xfe74], [0xfe76, 0xfefc],
];
const WHITESPACE = new Set([0x09, 0x0a, 0x0d]);   // layout characters: tab and line breaks are handled by the layout, not drawn

const covered = (cp: number): boolean => WHITESPACE.has(cp) || PDF_FONT_COVERAGE.some(([a, b]) => cp >= a && cp <= b);
const isArabic = (cp: number): boolean => (cp >= 0x600 && cp <= 0x6ff) || (cp >= 0x750 && cp <= 0x77f) || (cp >= 0x8a0 && cp <= 0x8ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff);

export function unsupportedCharacters(text: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const ch of text ?? "") if (!covered(ch.codePointAt(0) as number)) out.add(ch);
  return [...out];
}

export type UnsupportedField = { field: string; arabic: boolean; count: number };

export function findUnsupportedText(c: QuotationDocumentContent, ctx: QuotationDocumentContext): UnsupportedField[] {
  const fields: [string, string | null | undefined][] = [
    ["Client name", ctx.party.name], ["Client company", ctx.party.company], ["Client email", ctx.party.email], ["Client phone", ctx.party.phone],
    ["Contracting entity name", c.entity.legalName], ["Contracting entity type", c.entity.registrationType],
    ...c.entity.identifiers.flatMap((i, k): [string, string][] => [[`Entity identifier label ${k + 1}`, i.label], [`Entity identifier ${k + 1}`, i.identifier]]),
    ...c.activities.map((a, k): [string, string] => [`Activity ${k + 1}`, a.label]),
    ...c.items.flatMap((i, k): [string, string | null][] => [[`Line ${k + 1} item`, i.service], [`Line ${k + 1} description`, i.description], [`Line ${k + 1} unit`, i.unitBasis]]),
    ["Payment and booking terms", c.paymentBookingTerms], ["Reference", c.reference], ["Currency", c.currency],
  ];
  return fields.flatMap(([field, text]) => {
    const bad = unsupportedCharacters(text);
    return bad.length ? [{ field, arabic: bad.some((ch) => isArabic(ch.codePointAt(0) as number)), count: bad.length }] : [];
  });
}

export function unsupportedMessage(found: UnsupportedField[]): string {
  const where = found.map((f) => f.field).join(", ");
  const arabicStray = found.some((f) => f.arabic) ? " Some of the Arabic characters are outside the set the PDF's Arabic font supports." : "";
  return `The quotation PDF was not generated because ${where} contains characters its fonts cannot draw, and they would otherwise be printed wrongly or left out.${arabicStray} The browser print view may show them; the PDF fonts cover Latin and Arabic script only. Nothing was changed.`;
}
