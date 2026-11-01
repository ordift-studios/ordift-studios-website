import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { applyEligibility, resolveLicensed } from "../eligibility";
import { REGISTRY } from "./index";
import { PACKAGE_KEYS, SECTION_KEYS } from "./keys";
import { lintCopy } from "./lint";
import { applyEditorialContent } from "./merge";
import { syntheticDraft } from "./testDraft";
import { SUPPORTING_COPY_UNAPPROVED } from "./supporting";

describe("registry integrity (the shipped registry)", () => {
  it("the authoritative key list has 47 distinct keys, and it is exactly what the mappers produce", () => {
    expect(new Set(PACKAGE_KEYS).size).toBe(47); expect(PACKAGE_KEYS).toHaveLength(47);
    const d = syntheticDraft();
    expect(d.sections.flatMap((s) => s.items.map((i) => i.key)).sort()).toEqual([...PACKAGE_KEYS].sort());
    expect(d.sections.map((s) => s.key).sort()).toEqual([...SECTION_KEYS].sort());
  });
  it("every registry key is an existing package or section key (no new package or add-on keys, no typos)", () => {
    for (const k of Object.keys(REGISTRY.packages)) expect(PACKAGE_KEYS, k).toContain(k);
    for (const k of Object.keys(REGISTRY.sections)) expect(SECTION_KEYS, k).toContain(k);
  });
  it("every shipped piece of wording passes the placeholder and unsupported-claim checks (descriptions at the description limit)", () => {
    for (const e of Object.values(REGISTRY.packages)) for (const c of [e, ...Object.values(e.markets ?? {})]) {
      if (c.description) expect(lintCopy(c.description, "description"), c.description).toEqual([]);
      for (const t of [c.note, ...(c.appendInclusions ?? [])]) if (t) expect(lintCopy(t), t).toEqual([]);
    }
  });
  it("exact key coverage: all 47 package keys have a registry entry, and nothing else does", () => {
    expect(Object.keys(REGISTRY.packages).sort()).toEqual([...PACKAGE_KEYS].sort());
    for (const e of Object.values(REGISTRY.packages)) expect(e.description?.trim().length ?? 0).toBeGreaterThan(40);
  });
  it("approval statuses: all 47 descriptions are Founder-approved (37 previously reviewed + 10 commercial approved in Phase 2C); none is a reviewed draft or a held-back draft", () => {
    const by = (st: string) => Object.entries(REGISTRY.packages).filter(([, e]) => e.status === st).map(([k]) => k).sort();
    expect(by("approved")).toHaveLength(47); expect(by("reviewed_draft")).toEqual([]); expect(by("draft")).toEqual([]);
    expect(Object.values(REGISTRY.packages).every((e) => e.status === "approved")).toBe(true);
  });
  it("wording fingerprints: the descriptions are exactly the Content Master text (same serialization and order as Phase 2B: key TAB text, joined by newline, in Content Master order)", () => {
    const sha = (keys: readonly string[]) => createHash("sha256").update(keys.map((k) => `${k}\t${REGISTRY.packages[k].description}`).join("\n")).digest("hex");
    expect(sha(PACKAGE_KEYS.filter((k) => k.startsWith("com-")))).toBe("7fd61848a73204b002f18ed40632580119f8c611455d80417ace19c14aac4147");   // the ten commercial descriptions
    expect(sha(PACKAGE_KEYS)).toBe("0ac4a36cdc7cccbd0a2a106f556fa2976509a15c7e1805dd528637a63123ea07");                                           // all 47
  });
  it("shipped registry on a 47-package draft: 47 approved descriptions merged, 0 reviewed drafts, 0 draft-only, 0 missing, 0 rejected, 0 unknown, for both markets", () => {
    for (const m of ["ghana", "qatar"]) {
      const { content, report } = applyEditorialContent(syntheticDraft(m), REGISTRY, m);
      expect(report.items).toBe(47); expect(report.rejected).toEqual([]); expect(report.unknownKeys).toEqual([]); expect(report.missingDescriptions).toEqual([]);
      expect([report.approvedDescribed, report.reviewedDraft.length, report.draftOnly.length]).toEqual([47, 0, 0]); expect(report.described).toBe(47);
      for (const i of content.sections.flatMap((s) => s.items)) expect(i.description, i.key).toBe(REGISTRY.packages[i.key].description);
    }
  });
  it("description approval no longer blocks: the only approval blockers left are not about package wording (the corporate minimum)", () => {
    for (const m of ["ghana", "qatar"]) {
      const b = applyEditorialContent(syntheticDraft(m), REGISTRY, m).report.approvalBlockers.join(" ");
      expect(b).not.toMatch(/reviewed drafts awaiting|new proposals awaiting/); expect(b).toMatch(/Corporate headshots are not ready for approval/);
    }
  });
  it("Ghana shows 47 eligible descriptions; Qatar shows 21 and no film or combined package", () => {
    const eligible = (m: "ghana" | "qatar") => {
      const lic = m === "qatar" ? resolveLicensed("qatar", "Qatar", "Test entity", "2026-11-01", undefined, ["photography"]) : resolveLicensed("ghana", "Ghana", "Test entity", "2026-11-01", undefined, []);
      const card = applyEligibility(applyEditorialContent(syntheticDraft(m), REGISTRY, m).content, lic);
      return card.sections.flatMap((s) => s.items).filter((i) => i.included !== false && i.eligibility?.ok);
    };
    const g = eligible("ghana"); const q = eligible("qatar");
    expect(g).toHaveLength(47); expect(g.every((i) => i.description.length > 40)).toBe(true);
    expect(q).toHaveLength(21); expect(q.every((i) => i.description.length > 40)).toBe(true);
    expect(q.filter((i) => /-film-|-photography_film-/.test(i.key))).toEqual([]);
    expect(q.every((i) => i.activities?.length === 1 && i.activities[0] === "photography")).toBe(true);
  });
  it("the supporting copy marked 'review required' is recorded but wired into nothing", () => {
    const { content } = applyEditorialContent(syntheticDraft(), REGISTRY, "ghana");
    for (const t of Object.values(SUPPORTING_COPY_UNAPPROVED)) expect(JSON.stringify(content)).not.toContain(t);
    expect(Object.keys(REGISTRY.sections)).toHaveLength(9); expect(REGISTRY.conditions).toEqual({}); expect(REGISTRY.contact).toEqual({});   // sections: only the nine approved quotation notes
  });
});

describe("wording checks refuse undefined promises and placeholders", () => {
  const bad: [string, string][] = [
    ["turnaround", "Delivered within 5 days of the event."], ["turnaround", "A 48-hour turnaround is available."], ["usage rights", "Includes full usage rights for the images."], ["licensing", "Commercial licence included."],
    ["deposit", "A 30% deposit secures the date."], ["payment", "Flexible payment schedule."], ["travel", "Travel within the city is covered."], ["revisions", "Two revisions are included."],
    ["gallery", "Online gallery available for 90 days."], ["sneak peek", "Priority sneak peek within 48 hours."], ["documentary", "A 20 minute documentary edit."], ["guarantee", "We guarantee your satisfaction."],
    ["percentage", "Priority delivery adds 30% to the total."], ["placeholder", "[PLACEHOLDER] wording"], ["TODO", "TODO write this"], ["empty", "   "], ["length", "x".repeat(300)],
  ];
  for (const [name, text] of bad) it(`refuses: ${name}`, () => expect(lintCopy(text, "description").length, text).toBeGreaterThan(0));
  it("accepts plain, defined wording", () => {
    for (const t of ["Four hours of event photography coverage with a larger selection of edited images.", "Standard base rate: USD 55 per image", "Final pricing depends on image quantity, production complexity and the agreed project brief. Volume-adjusted rates may apply."]) expect(lintCopy(t, "description"), t).toEqual([]);
  });
});
