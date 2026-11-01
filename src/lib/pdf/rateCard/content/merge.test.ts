import { describe, expect, it } from "vitest";
import { applyEditorialContent, KNOWN_NOTICES, MergeSafetyError, describeReport, assertCommercialDataUnchanged } from "./merge";
import type { Registry } from "./schema";
import { syntheticDraft } from "./testDraft";
import { applyEligibility, resolveLicensed } from "../eligibility";
import { usdDrift } from "../convert";
import { validateRateCard } from "../validate";

const EMPTY: Registry = { packages: {}, sections: {}, conditions: {}, contact: {} };
const withCopy = (packages: Registry["packages"], extra: Partial<Registry> = {}): Registry => ({ ...EMPTY, packages, ...extra });
const qatar = (d: ReturnType<typeof syntheticDraft>) => applyEligibility(d, resolveLicensed("qatar", "Qatar", "Test entity", "2026-11-01", undefined, ["photography"]));
const item = (c: ReturnType<typeof syntheticDraft>, key: string) => c.sections.flatMap((s) => s.items).find((i) => i.key === key)!;

describe("merge: one entry per package, reused across markets, with field-level market overrides", () => {
  const reg = withCopy({ "ps-1h": { description: "One hour, shared.", markets: { qatar: { description: "One hour, Qatar wording." } } }, "event-photography-half_day": { description: "Shared half day." } });
  it("a shared description is applied in both markets; an override replaces only that market", () => {
    const g = applyEditorialContent(syntheticDraft("ghana"), reg, "ghana"); const q = applyEditorialContent(syntheticDraft("qatar"), reg, "qatar");
    expect(item(g.content, "ps-1h").description).toBe("One hour, shared."); expect(item(q.content, "ps-1h").description).toBe("One hour, Qatar wording.");
    expect(item(g.content, "event-photography-half_day").description).toBe("Shared half day."); expect(item(q.content, "event-photography-half_day").description).toBe("Shared half day.");
  });
  it("a package with no entry is reported missing and its description stays empty (nothing is generated or borrowed)", () => {
    const { content, report } = applyEditorialContent(syntheticDraft(), reg, "ghana");
    expect(report.described).toBe(2); expect(report.missingDescriptions).toHaveLength(45); expect(report.missingDescriptions).not.toContain("ps-1h");
    expect(item(content, "ps-2h").description).toBe("");
  });
  it("unknown registry keys are reported and never applied", () => {
    const { content, report } = applyEditorialContent(syntheticDraft(), withCopy({ "ps-9h": { description: "Nine hours." } }, { sections: { nonsense: { intro: "x" } } }), "ghana");
    expect(report.unknownKeys).toEqual(["package ps-9h", "section nonsense"]); expect(JSON.stringify(content)).not.toContain("Nine hours.");
  });
  it("text that fails the wording checks is rejected and reported, not applied", () => {
    const { content, report } = applyEditorialContent(syntheticDraft(), withCopy({ "ps-1h": { description: "Delivered within 2 days." }, "ps-2h": { description: "[PLACEHOLDER] copy" } }), "ghana");
    expect(report.rejected).toHaveLength(2); expect(item(content, "ps-1h").description).toBe(""); expect(item(content, "ps-2h").description).toBe("");
  });
  it("approved section wording replaces the placeholder note; a section without it is still reported", () => {
    const { content, report } = applyEditorialContent(syntheticDraft(), withCopy({}, { sections: { commercial: { customQuotationNote: "Tell us about your brief and we will prepare an individual quotation." } } }), "ghana");
    expect(content.sections.find((s) => s.key === "commercial")!.customQuotationNote).toMatch(/^Tell us/);
    expect(report.missingSectionWording).toHaveLength(8); expect(report.missingSectionWording).not.toContain("commercial");
  });
  it("approved terms and contact lines replace the placeholders for that market only", () => {
    const r = withCopy({}, { conditions: { ghana: [{ title: "Prices", text: "Prices are in US dollars." }] }, contact: { ghana: [{ label: "Email", value: "hello@example.com" }] } });
    const g = applyEditorialContent(syntheticDraft("ghana"), r, "ghana"); const q = applyEditorialContent(syntheticDraft("qatar"), r, "qatar");
    expect(g.report.missingConditions).toBe(false); expect(g.report.missingContact).toBe(false); expect(q.report.missingConditions).toBe(true); expect(q.report.missingContact).toBe(true);
  });
  it("every report carries the documented corporate-minimum notice", () => {
    expect(applyEditorialContent(syntheticDraft(), EMPTY, "ghana").report.notices).toEqual([...KNOWN_NOTICES]);
    expect(KNOWN_NOTICES[0]).toMatch(/Team Headshots only/); expect(describeReport(applyEditorialContent(syntheticDraft(), EMPTY, "ghana").report)).toMatch(/0 approved, 0 reviewed drafts, 0 draft-only \(held back\), 47 missing, of 47 packages/);
  });
});

describe("merge safety: wording only — selling data, eligibility and derived inclusions are untouched", () => {
  const reg = withCopy({ "ps-1h": { description: "One hour.", note: "Per session.", appendInclusions: ["An approved extra line"] }, "com-catalogue": { appendInclusions: ["Approved pricing sentence."] } });
  it("prices, tiers, minimums, add-ons, specs, activities, eligibility and inclusions (derived part) are identical before and after", () => {
    const before = qatar(syntheticDraft("qatar")); const { content } = applyEditorialContent(before, reg, "qatar");
    expect(() => assertCommercialDataUnchanged(before, content)).not.toThrow();
    expect(usdDrift(before, content)).toEqual([]); expect(content.sections.map((s) => s.minimum)).toEqual(before.sections.map((s) => s.minimum)); expect(content.sections.map((s) => s.addons)).toEqual(before.sections.map((s) => s.addons));
    expect(item(content, "ps-1h").inclusions.slice(0, 1)).toEqual(item(before, "ps-1h").inclusions); expect(item(content, "ps-1h").inclusions.at(-1)).toBe("An approved extra line");
  });
  it("eligibility is preserved: Qatar keeps 21 eligible packages, Ghana 47, and the unclassified add-ons stay excluded in both", () => {
    const ghana = applyEligibility(syntheticDraft("ghana"), resolveLicensed("ghana", "Ghana", "Test entity", "2026-11-01", undefined, []));
    const qat = qatar(syntheticDraft("qatar"));
    const ok = (c: typeof ghana) => c.sections.flatMap((s) => s.items).filter((i) => i.included !== false && i.eligibility?.ok).length;
    expect(ok(ghana)).toBe(47); expect(ok(qat)).toBe(21);
    for (const c of [applyEditorialContent(ghana, reg, "ghana").content, applyEditorialContent(qat, reg, "qatar").content]) {
      const u = c.sections.flatMap((s) => s.addons ?? []).filter((a) => a.activities?.includes("unclassified"));
      expect(u).toHaveLength(1); expect(u.every((a) => a.included === false && a.eligibility?.ok === false)).toBe(true);
    }
    expect(ok(applyEditorialContent(qat, reg, "qatar").content)).toBe(21);
  });
  it("the safety check actually fires if a price, an eligibility flag or a derived inclusion is altered", () => {
    const before = syntheticDraft(); const clone = () => JSON.parse(JSON.stringify(before)) as typeof before;
    const a = clone(); a.sections[0].items[0].price = { kind: "fixed", amount: 99 }; expect(() => assertCommercialDataUnchanged(before, a)).toThrow(MergeSafetyError);
    const b = clone(); b.sections[1].items[0].eligibility = { ok: false }; expect(() => assertCommercialDataUnchanged(before, b)).toThrow(MergeSafetyError);
    const c = clone(); c.sections[0].items[0].inclusions[0] = "changed"; expect(() => assertCommercialDataUnchanged(before, c)).toThrow(MergeSafetyError);
    const d = clone(); d.sections[0].minimum = { label: "x", price: { kind: "fixed", amount: 1 } }; expect(() => assertCommercialDataUnchanged(before, d)).toThrow(MergeSafetyError);
  });
  it("a draft with missing descriptions still cannot be approved (the existing gate is intact)", () => {
    const { content } = applyEditorialContent(syntheticDraft(), EMPTY, "ghana");
    expect(validateRateCard(content, "approval", { today: "2026-11-01" }).errors.join(" ")).toMatch(/no approved service description/);
  });
});

describe("Phase 2B: draft wording is held back and the corporate minimum blocks approval readiness", () => {
  it("wording marked draft is not applied and is reported separately from packages with no entry at all", () => {
    const { content, report } = applyEditorialContent(syntheticDraft(), withCopy({ "com-photography-focused": { status: "draft", description: "Unapproved draft wording." }, "ps-1h": { description: "Approved." } }), "ghana");
    expect(item(content, "com-photography-focused").description).toBe(""); expect(JSON.stringify(content)).not.toContain("Unapproved draft wording."); expect(report.draftOnly).toEqual(["com-photography-focused"]); expect(report.missingDescriptions).not.toContain("com-photography-focused"); expect(report.missingDescriptions).toHaveLength(45);
    expect(describeReport(report)).toMatch(/1 approved, 0 reviewed drafts, 1 draft-only \(held back\), 45 missing/);
  });
  it("every card with corporate packages carries the not-ready-for-approval flag in its report", () => {
    for (const m of ["ghana", "qatar"]) expect(applyEditorialContent(syntheticDraft(m), EMPTY, m).report.approvalBlockers.join(" ")).toMatch(/Corporate headshots are not ready for approval/);
  });
});

describe("Phase 2B: per-field status — a draft description does not hold back separately approved lines", () => {
  it("the catalogue pricing sentence is applied while the catalogue description (a draft) is withheld", () => {
    const reg = withCopy({ "com-catalogue": { status: "draft", description: "A new proposal.", appendInclusions: ["Approved pricing sentence."] } });
    const c = item(applyEditorialContent(syntheticDraft(), reg, "ghana").content, "com-catalogue");
    expect(c.description).toBe(""); expect(c.inclusions.at(-1)).toBe("Approved pricing sentence.");
  });
  it("a reviewed draft is merged for preview but listed, and blocks approval readiness", () => {
    const { content, report } = applyEditorialContent(syntheticDraft(), withCopy({ "ps-1h": { status: "reviewed_draft", description: "Reviewed draft wording." } }), "ghana");
    expect(item(content, "ps-1h").description).toBe("Reviewed draft wording."); expect(report.reviewedDraft).toEqual(["ps-1h"]); expect(report.approvedDescribed).toBe(0); expect(report.approvalBlockers.join(" ")).toMatch(/ps-1h/);
  });
});
