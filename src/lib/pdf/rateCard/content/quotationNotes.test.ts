import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { REGISTRY } from "./index";
import { QUOTATION_NOTES } from "./quotationNotes";
import { PACKAGE_KEYS, SECTION_KEYS } from "./keys";
import { lintCopy, MAX_DESCRIPTION, MAX_NOTE } from "./lint";
import { applyEditorialContent, assertCommercialDataUnchanged, PUBLICATION_BLOCKERS_OUTSIDE_WORDING } from "./merge";
import type { Registry } from "./schema";
import { syntheticDraft } from "./testDraft";
import { applyEligibility, resolveLicensed } from "../eligibility";
import { contentHash } from "../edition";
import { usdDrift } from "../convert";
import { RateCardDocument, pageBreaks, quotationNoteHeight } from "../RateCardDocument";
import { unknownKeys, validateRateCard } from "../validate";
import { PLACEHOLDER_MARK, type RateCardContent, type RateCardSection } from "../types";

const ORDER = ["personal_sessions", "wedding_photography", "wedding_film", "wedding_photography_film", "event_photography", "event_film", "event_photography_film", "corporate_headshots", "commercial"];
const GHANA_ONLY = ["wedding_film", "wedding_photography_film", "event_film", "event_photography_film"];
const sha = (rows: string[]) => createHash("sha256").update(rows.join("\n")).digest("hex");
const QATAR_COMMERCIAL = QUOTATION_NOTES.commercial.markets!.qatar!;

const build = (m: "ghana" | "qatar") => {
  const lic = m === "qatar" ? resolveLicensed("qatar", "Qatar", "Test entity", "2026-11-01", undefined, ["photography"]) : resolveLicensed("ghana", "Ghana", "Test entity", "2026-11-01", undefined, []);
  const draft = syntheticDraft(m); draft.sections = draft.sections.map((x) => ({ ...x, customQuotationNote: `${PLACEHOLDER_MARK} Wording for requirements that do not fit a standard package.` }));   // as the loader builds it
  const base = applyEligibility(draft, lic);
  const merged = applyEditorialContent(base, REGISTRY, m);
  return { base, ...merged };
};
const shown = (c: RateCardContent) => c.sections.filter((s) => s.items.some((i) => i.included !== false));

describe("Phase 2D registry: nine approved quotation notes", () => {
  it("exactly nine section records, one per section key, all approved", () => {
    expect(Object.keys(QUOTATION_NOTES)).toEqual(ORDER); expect([...ORDER].sort()).toEqual([...SECTION_KEYS].sort());
    expect(Object.keys(REGISTRY.sections)).toEqual(ORDER); expect(Object.values(QUOTATION_NOTES).every((e) => e.status === "approved")).toBe(true);
  });
  it("exact-text fidelity: headings and descriptions equal the approved text (fingerprints; original serialization: section TAB heading TAB text, joined by newline, in order 01–09)", () => {
    expect(sha(ORDER.map((k) => `${k}\t${QUOTATION_NOTES[k].customQuotationHeading}\t${QUOTATION_NOTES[k].customQuotationNote}`))).toBe("2e2b918c0a570e7e0592d5dda2fc0ea7373ab045d137237258b7d51a7ba7ddfe");
    expect(sha([`commercial\t${QATAR_COMMERCIAL.customQuotationHeading}\t${QATAR_COMMERCIAL.customQuotationNote}`])).toBe("12de219e5f0ee2942bd4f7a39ba3ec91330cd9d0c2339cec3445e66dab8bc75f");
    expect(["celebration’s", "event’s"].every((w) => Object.values(QUOTATION_NOTES).some((e) => e.customQuotationNote!.includes(w)))).toBe(true);   // curly apostrophes preserved
  });
  it("the Qatar variation is the Ghana note without film wording, with the same heading", () => {
    expect(QATAR_COMMERCIAL.customQuotationNote).toBe(QUOTATION_NOTES.commercial.customQuotationNote!.replace(" and film", ""));
    expect(QATAR_COMMERCIAL.customQuotationHeading).toBe(QUOTATION_NOTES.commercial.customQuotationHeading); expect(QATAR_COMMERCIAL.customQuotationNote).not.toMatch(/film|video/i);
  });
  it("only the four film and combined notes are Ghana-only", () => {
    expect(ORDER.filter((k) => QUOTATION_NOTES[k].availableIn?.join() === "ghana")).toEqual(GHANA_ONLY); expect(ORDER.filter((k) => !QUOTATION_NOTES[k].availableIn)).toHaveLength(5);
  });
});

describe("Phase 2D merge: section mapping, markets, placeholders, duplicates", () => {
  it("Ghana: all nine notes (heading + exact description) land on their own sections and are displayed", () => {
    const { content, report } = build("ghana"); const s = (k: string) => content.sections.find((x) => x.key === k)!;
    for (const k of ORDER) { expect(s(k).customQuotationHeading, k).toBe(QUOTATION_NOTES[k].customQuotationHeading); expect(s(k).customQuotationNote, k).toBe(QUOTATION_NOTES[k].customQuotationNote); }
    expect(shown(content).filter((x) => x.customQuotationNote)).toHaveLength(9);
    expect(report.quotationNotes.approved).toEqual(ORDER); expect(report.quotationNotes.withheld).toEqual([]); expect(report.quotationNotes.marketVariants).toEqual([]); expect(report.quotationNotes.missing).toEqual([]);
  });
  it("Qatar: five notes displayed, the Qatar-specific commercial wording, and no film or combined note anywhere in the card", () => {
    const { content, report } = build("qatar"); const s = (k: string) => content.sections.find((x) => x.key === k)!;
    const displayed = shown(content); expect(displayed.map((x) => x.key)).toEqual(["personal_sessions", "wedding_photography", "event_photography", "corporate_headshots", "commercial"]);
    expect(displayed.every((x) => x.customQuotationNote && x.customQuotationHeading)).toBe(true);
    expect(s("commercial").customQuotationNote).toBe(QATAR_COMMERCIAL.customQuotationNote); expect(s("commercial").customQuotationHeading).toBe(QATAR_COMMERCIAL.customQuotationHeading);
    expect(report.quotationNotes.withheld).toEqual(GHANA_ONLY); expect(report.quotationNotes.marketVariants).toEqual(["commercial"]); expect(report.quotationNotes.approved).toHaveLength(5);
    for (const k of GHANA_ONLY) { expect(s(k).customQuotationNote, k).toBeUndefined(); expect(s(k).customQuotationHeading, k).toBeUndefined(); }
    const text = displayed.map((x) => `${x.customQuotationHeading} ${x.customQuotationNote}`).join(" "); expect(text).not.toMatch(/film|video|cinematic|movement/i);
    expect(JSON.stringify(content)).not.toContain(QUOTATION_NOTES.commercial.customQuotationNote!);                 // the Ghana (film) wording is never in Qatar content
  });
  it("no duplicates: every note text appears exactly once per card and no two sections share text", () => {
    for (const m of ["ghana", "qatar"] as const) {
      const { content } = build(m); const json = JSON.stringify(content);
      const notes = content.sections.map((x) => x.customQuotationNote).filter(Boolean) as string[];
      expect(new Set(notes).size).toBe(notes.length); for (const n of notes) expect(json.split(JSON.stringify(n)).length - 1, n.slice(0, 30)).toBe(1);
    }
  });
  it("no quotation-note placeholders remain after integration, in either market; nothing is reported missing", () => {
    for (const m of ["ghana", "qatar"] as const) {
      const { content, report } = build(m);
      for (const x of content.sections) expect(x.customQuotationNote ?? "").not.toContain(PLACEHOLDER_MARK);
      expect(report.missingSectionWording).toEqual([]); expect(report.rejected).toEqual([]); expect(report.unknownKeys).toEqual([]);
    }
  });
  it("missing, draft and withheld notes stay distinguishable", () => {
    const reg: Registry = { packages: {}, conditions: {}, contact: {}, sections: { personal_sessions: { status: "draft", customQuotationHeading: "H", customQuotationNote: "A draft note." }, event_film: { availableIn: ["ghana"], customQuotationNote: "Ghana only note." }, corporate_headshots: { customQuotationNote: "Corporate note.", markets: { qatar: { omit: true } } } } };
    const placeholder = syntheticDraft("qatar"); placeholder.sections = placeholder.sections.map((x) => ({ ...x, customQuotationNote: `${PLACEHOLDER_MARK} note` }));
    const { content, report } = applyEditorialContent(placeholder, reg, "qatar"); const q = report.quotationNotes;
    expect(q.draft).toEqual(["personal_sessions"]); expect(q.withheld).toEqual(["event_film", "corporate_headshots"]); expect(q.approved).toEqual([]); expect(q.missing).toHaveLength(6);
    expect(content.sections.find((x) => x.key === "personal_sessions")!.customQuotationNote).toContain(PLACEHOLDER_MARK);             // a draft keeps the visible placeholder
    expect(content.sections.find((x) => x.key === "event_film")!.customQuotationNote).toBeUndefined();                                // a withheld note clears it
    expect(report.missingSectionWording).toHaveLength(7);                                                                              // 6 with no entry + the held-back draft
  });
  it("every report lists the publication blockers that wording cannot clear, and the corporate minimum stays flagged", () => {
    for (const m of ["ghana", "qatar"] as const) {
      const { report } = build(m);
      for (const b of PUBLICATION_BLOCKERS_OUTSIDE_WORDING) expect(report.publicationBlockers).toContain(b);
      expect(report.publicationBlockers.join(" ")).toMatch(/terms blocks/); expect(report.publicationBlockers.join(" ")).toMatch(/contact details/);
      expect(report.approvalBlockers.join(" ")).toMatch(/Corporate headshots are not ready for approval/);
    }
  });
});

describe("Phase 2D safety: packages, prices, eligibility and stored content are untouched", () => {
  it("no new package keys, add-on names, sections, prices, tiers, minimums or eligibility", () => {
    for (const m of ["ghana", "qatar"] as const) {
      const { base, content } = build(m);
      expect(content.sections.flatMap((x) => x.items.map((i) => i.key)).sort()).toEqual([...PACKAGE_KEYS].sort()); expect(content.sections.map((x) => x.key)).toEqual(base.sections.map((x) => x.key));
      expect(content.sections.map((x) => x.addons?.map((a) => a.name))).toEqual(base.sections.map((x) => x.addons?.map((a) => a.name)));
      expect(() => assertCommercialDataUnchanged(base, content)).not.toThrow(); expect(usdDrift(base, content)).toEqual([]);
      expect(shown(content)).toHaveLength(m === "qatar" ? 5 : 9);
    }
  });
  it("the merge does not mutate the content it is given, so a stored edition's hash is unchanged", async () => {
    const stored = syntheticDraft("ghana"); const before = await contentHash(stored); applyEditorialContent(stored, REGISTRY, "ghana"); expect(await contentHash(stored)).toBe(before);
  });
  it("backward compatible: content with no heading is valid, the heading key is allowed, an unknown key is still refused", () => {
    const old = syntheticDraft("ghana"); expect(old.sections.every((x) => x.customQuotationHeading === undefined)).toBe(true);
    expect(unknownKeys(old)).toEqual([]); expect(validateRateCard(old, "draft").errors).toEqual([]);
    const withHeading = { ...old, sections: old.sections.map((x, n) => (n === 0 ? { ...x, customQuotationHeading: "H" } : x)) }; expect(unknownKeys(withHeading)).toEqual([]);
    const bad = { ...old, sections: old.sections.map((x, n) => (n === 0 ? ({ ...x, customQuoteHeading: "H" } as RateCardSection) : x)) }; expect(unknownKeys(bad)).toEqual(["sections[0].customQuoteHeading"]);
  });
});

describe("Phase 2D wording checks: a separate note limit, every claims check intact", () => {
  it("all nine approved notes and the Qatar variant are valid notes; every heading is a valid heading", () => {
    for (const e of Object.values(QUOTATION_NOTES)) { expect(lintCopy(e.customQuotationNote!, "note"), e.customQuotationNote).toEqual([]); expect(lintCopy(e.customQuotationHeading!, "heading")).toEqual([]); }
    expect(lintCopy(QATAR_COMMERCIAL.customQuotationNote!, "note")).toEqual([]);
  });
  it("the limits are separate: four approved notes exceed the description limit, yet the description limit itself is unchanged", () => {
    expect(MAX_DESCRIPTION).toBe(240); expect(MAX_NOTE).toBeGreaterThanOrEqual(279);
    expect(Object.values(QUOTATION_NOTES).filter((e) => e.customQuotationNote!.length > MAX_DESCRIPTION)).toHaveLength(4);
    expect(lintCopy("x".repeat(250), "description")).toContain("longer than 240 characters");
  });
  it("an over-long note, a placeholder note and every unsupported promise are still refused", () => {
    expect(lintCopy("x".repeat(MAX_NOTE + 1), "note")).toContain(`longer than ${MAX_NOTE} characters`); expect(lintCopy("[PLACEHOLDER] note", "note").length).toBeGreaterThan(0);
    for (const t of ["We deliver within 5 days.", "Usage rights are included.", "A 30% deposit applies.", "Travel is covered.", "Two revisions are included.", "We guarantee it."]) expect(lintCopy(t, "note"), t).not.toEqual([]);
    expect(lintCopy("y".repeat(81), "heading")).toContain("longer than 80 characters");
  });
});

// Walks a react-pdf element tree, calling function components, and returns the text in document order.
function texts(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string") { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((n) => texts(n, out)); return out; }
  const el = node as { type: unknown; props: { children?: unknown } & Record<string, unknown> };
  if (typeof el.type === "function") return texts((el.type as (p: unknown) => unknown)(el.props), out);
  return texts(el.props?.children, out);
}
describe("Phase 2D rendering: the note closes its section", () => {
  const { content } = build("ghana");
  const doc = RateCardDocument({ content, status: { state: "draft" }, logoWhite: "x" }) as { props: { children: unknown } };
  const pages: string[][] = []; const collect = (n: unknown) => { if (Array.isArray(n)) n.forEach(collect); else if (n && typeof n === "object") { const e = n as { type: unknown; props: Record<string, unknown> }; if (typeof e.type === "function" && (e.type as { name: string }).name === "Section") pages.push(texts(e)); else collect(e.props?.children); } };
  collect(doc.props.children);
  it("each shown section prints its heading and description once, after its last package and after the add-ons", () => {
    expect(pages).toHaveLength(9);
    for (const [n, k] of ORDER.entries()) {
      const t = pages[n]; const h = t.indexOf(QUOTATION_NOTES[k].customQuotationHeading!); const d = t.indexOf(QUOTATION_NOTES[k].customQuotationNote!);
      expect(h, k).toBeGreaterThan(-1); expect(d, k).toBe(h + 1); expect(t.filter((x) => x === QUOTATION_NOTES[k].customQuotationNote)).toHaveLength(1);
      const last = Math.max(...content.sections[n].items.map((i) => t.indexOf(i.name))); expect(h, k).toBeGreaterThan(last);
      if (t.includes("Additional services")) expect(h, k).toBeGreaterThan(t.indexOf("Additional services"));
    }
  });
  it("the note's height is counted at the end of the section, so a section that would strand the note is balanced across pages", () => {
    const sec = content.sections.find((x) => x.key === "corporate_headshots")!; expect(quotationNoteHeight(sec)).toBeGreaterThan(80); expect(quotationNoteHeight({ ...sec, customQuotationNote: undefined })).toBe(0);
    expect(quotationNoteHeight({ ...sec, customQuotationHeading: undefined })).toBeLessThan(quotationNoteHeight(sec));
    expect(pageBreaks([150, 150, 150, 150], 50, 0)).toEqual([]); expect(pageBreaks([150, 150, 150, 150], 50, quotationNoteHeight(sec) + 44)).toHaveLength(1);
  });
});
