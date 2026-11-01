import { PLACEHOLDER_MARK, type RateCardContent, type RateCardItem, type RateCardSection } from "../types";
import { lintCopy } from "./lint";
import type { Copy, ContentReport, Registry, RegistryMarket, SectionCopy } from "./schema";

// The corporate minimum is approved policy for all three headshot products, but the quotation engine applies it to Team Headshots only (corporateHeadshotEstimate.ts). Until the separate pricing
// release, the card must not imply otherwise, and this is recorded wherever the content report is shown.
export const KNOWN_NOTICES: readonly string[] = [
  "Corporate minimum booking: approved for Individual, Executive and Team headshots, but the quotation engine currently applies it to Team Headshots only. Pricing correction pending a separate release.",
];

// Shown as a blocker whenever the card contains included corporate headshot packages: the approved minimum policy is not yet applied by the quotation engine for Individual and Executive headshots.
export const CORPORATE_MINIMUM_BLOCKER = "Corporate headshots are not ready for approval: the approved minimum booking (Ghana USD 250, Qatar USD 400) is not yet applied to Individual and Executive headshots in quotations. Release the pricing correction first.";

// Publication requirements that are NOT package wording and are not satisfied by any amount of approved wording. Listed in every content report so that complete description and note coverage is never mistaken
// for a publishable card.
export const PUBLICATION_BLOCKERS_OUTSIDE_WORDING: readonly string[] = [
  "Cover photographs and image clearances.",
  "Ghana issuing-entity and activity-scope verification (Ghana scope rests on guidance, not a verified registration).",
  "Edition label, edition approval and publication authorization.",
  "Currency: USD only; QAR and GHS remain blocked by policy.",
  "Undefined conditions: commercial usage rights, sneak peek timing, documentary edit specification, turnaround and delivery, travel and location, deposits and payment, gallery duration.",
  "Unapproved supporting service-application paragraphs (not published).",
  "Starting a next edition copies stored content and does not refresh wording (a re-apply action is not built).",
];

export class MergeSafetyError extends Error {}

const isMarket = (m: string): m is RegistryMarket => m === "ghana" || m === "qatar";
const pick = <T extends Copy | SectionCopy>(base: T | undefined, over: T | undefined): T => ({ ...(base ?? {}), ...(over ?? {}) }) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Everything an item or section carries EXCEPT its wording: if the merge ever changes one of these, it stops.
export function assertCommercialDataUnchanged(before: RateCardContent, after: RateCardContent) {
  if (before.sections.length !== after.sections.length) throw new MergeSafetyError("The merge changed the number of categories.");
  before.sections.forEach((s, si) => {
    const t = after.sections[si];
    for (const k of ["key", "title", "structure", "minimum", "addons"] as const) if (!same(s[k], t[k])) throw new MergeSafetyError(`The merge changed “${s.key}” ${k}.`);
    if (s.items.length !== t.items.length) throw new MergeSafetyError(`The merge changed the number of items in “${s.key}”.`);
    s.items.forEach((i, ii) => {
      const j = t.items[ii];
      for (const k of ["key", "name", "price", "conversion", "tiers", "specs", "source", "activities", "included", "eligibility"] as const) if (!same(i[k], j[k])) throw new MergeSafetyError(`The merge changed “${i.key}” ${k}.`);
      if (!same(i.inclusions, j.inclusions.slice(0, i.inclusions.length))) throw new MergeSafetyError(`The merge changed the derived inclusions of “${i.key}”.`);
    });
  });
  if (!same(before.meta, after.meta) || before.coverImage !== after.coverImage || !same(before.cover, after.cover)) throw new MergeSafetyError("The merge changed the card's meta or cover.");
}

function checkedCopy(label: string, c: Copy | undefined, rejected: string[]): Copy | undefined {
  if (!c) return undefined;
  const problems: string[] = [];
  if (c.description !== undefined) problems.push(...lintCopy(c.description, "description").map((p) => `description: ${p}`));
  if (c.note !== undefined) problems.push(...lintCopy(c.note).map((p) => `note: ${p}`));
  c.appendInclusions?.forEach((l, n) => problems.push(...lintCopy(l).map((p) => `line ${n + 1}: ${p}`)));
  if (problems.length) { rejected.push(`${label}: ${problems.join("; ")}`); return undefined; }
  return c;
}

// Applies approved wording to a freshly built draft. Wording only: prices, specifications, derived inclusions, eligibility and activities are untouched (checked below). A package with no approved
// wording keeps its empty description and is REPORTED — nothing is generated or copied from another package. Registry text that fails the wording checks is rejected and reported, not applied.
export function applyEditorialContent(draft: RateCardContent, registry: Registry, marketSlug: string): { content: RateCardContent; report: ContentReport } {
  const market = isMarket(marketSlug) ? marketSlug : undefined;
  const rejected: string[] = []; const matched = new Set<string>(); const matchedSections = new Set<string>();
  const report: ContentReport = { market: marketSlug, items: 0, described: 0, approvedDescribed: 0, reviewedDraft: [], missingDescriptions: [], missingSectionWording: [], quotationNotes: { approved: [], draft: [], missing: [], withheld: [], marketVariants: [] }, missingConditions: false, missingContact: false, unknownKeys: [], draftOnly: [], rejected, notices: [...KNOWN_NOTICES], approvalBlockers: [], publicationBlockers: [] };

  const sections: RateCardSection[] = draft.sections.map((s) => {
    const se = registry.sections[s.key]; if (se) matchedSections.add(s.key);
    const ov = market ? se?.markets?.[market] : undefined;
    const q = report.quotationNotes;
    const next: RateCardSection = { ...s };
    const withheld = !!se && ((se.availableIn ? !(market && se.availableIn.includes(market)) : false) || ov?.omit === true);
    if (withheld) {                                                       // deliberately not shown in this market: the placeholder is cleared, and the report says why it is absent
      q.withheld.push(s.key); delete next.customQuotationNote; delete next.customQuotationHeading;
    } else if (se?.status === "draft") {                                  // a draft note is held back; the placeholder stays so the gap stays visible
      q.draft.push(s.key);
    } else {
      const sc = pick<SectionCopy>(se, ov);
      const secProblems = [...(sc.intro !== undefined ? lintCopy(sc.intro, "description") : []), ...(sc.customQuotationHeading !== undefined ? lintCopy(sc.customQuotationHeading, "heading") : []), ...(sc.customQuotationNote !== undefined ? lintCopy(sc.customQuotationNote, "note") : []), ...(sc.notes ?? []).flatMap((n) => lintCopy(n))];
      const secOk = secProblems.length === 0;
      if (!secOk) rejected.push(`section ${s.key}: ${secProblems.join("; ")}`);
      if (secOk && sc.intro) next.intro = sc.intro;
      if (secOk && sc.customQuotationHeading) next.customQuotationHeading = sc.customQuotationHeading;
      if (secOk && sc.customQuotationNote) { next.customQuotationNote = sc.customQuotationNote; q.approved.push(s.key); if (ov?.customQuotationNote) q.marketVariants.push(s.key); }
      if (secOk && sc.notes?.length) next.notes = [...(s.notes ?? []), ...sc.notes];
      if (!se) q.missing.push(s.key);
    }
    if (!withheld && (!next.customQuotationNote || next.customQuotationNote.includes(PLACEHOLDER_MARK))) report.missingSectionWording.push(s.key);
    next.items = s.items.map((i): RateCardItem => {
      report.items += 1;
      const e = registry.packages[i.key]; if (e) matched.add(i.key);
      const held = e?.status === "draft";                                                                     // a new proposal: its description never reaches a card
      if (held) report.draftOnly.push(i.key);
      const resolved = pick<Copy>(e, market ? e?.markets?.[market] : undefined);
      const c = checkedCopy(`package ${i.key}`, held ? { ...resolved, description: undefined } : resolved, rejected);
      const o: RateCardItem = { ...i };
      if (c?.description) {
        o.description = c.description; report.described += 1;
        if (e?.status === "reviewed_draft") report.reviewedDraft.push(i.key); else report.approvedDescribed += 1;
      } else if (!held) report.missingDescriptions.push(i.key);
      if (c?.note) o.note = c.note;
      if (c?.appendInclusions?.length) o.inclusions = [...i.inclusions, ...c.appendInclusions];
      return o;
    });
    return next;
  });

  // registry keys that matched no item or section of this draft (in a Qatar draft the film packages still exist as excluded items, so they match)
  for (const k of Object.keys(registry.packages)) if (!matched.has(k)) report.unknownKeys.push(`package ${k}`);
  for (const k of Object.keys(registry.sections)) if (!matchedSections.has(k)) report.unknownKeys.push(`section ${k}`);

  let conditions = draft.conditions; let contact = draft.contact;
  const rc = market ? registry.conditions[market] : undefined; const rk = market ? registry.contact[market] : undefined;
  const condProblems = (rc ?? []).flatMap((c) => [...lintCopy(c.title), ...lintCopy(c.text, "description")]);
  const contactProblems = (rk ?? []).flatMap((c) => [...lintCopy(c.label), ...lintCopy(c.value)]);
  if (rc?.length && !condProblems.length) conditions = rc.map((x) => ({ ...x })); else if (condProblems.length) rejected.push(`conditions: ${condProblems.join("; ")}`);
  if (rk?.length && !contactProblems.length) contact = rk.map((x) => ({ ...x })); else if (contactProblems.length) rejected.push(`contact: ${contactProblems.join("; ")}`);
  report.missingConditions = conditions.some((c) => c.text.includes(PLACEHOLDER_MARK));
  report.missingContact = contact.some((c) => c.value.includes(PLACEHOLDER_MARK));
  report.publicationBlockers = [
    ...(report.missingConditions ? [`${marketSlug === "qatar" ? "Qatar" : marketSlug === "ghana" ? "Ghana" : marketSlug} terms blocks are not supplied.`] : []),
    ...(report.missingContact ? ["Verified contact details are not supplied."] : []),
    ...(report.missingSectionWording.length ? [`Quotation notes missing or not approved for: ${report.missingSectionWording.join(", ")}.`] : []),
    ...PUBLICATION_BLOCKERS_OUTSIDE_WORDING,
  ];

  if (report.reviewedDraft.length) report.approvalBlockers.push(`${report.reviewedDraft.length} description(s) are reviewed drafts awaiting exact-text Founder approval: ${report.reviewedDraft.join(", ")}.`);
  if (report.draftOnly.length) report.approvalBlockers.push(`${report.draftOnly.length} description(s) are new proposals awaiting Founder approval and are not on the card: ${report.draftOnly.join(", ")}.`);
  if (sections.some((s) => s.key === "corporate_headshots" && s.items.some((i) => i.included !== false))) report.approvalBlockers.push(CORPORATE_MINIMUM_BLOCKER);
  const content: RateCardContent = { ...draft, sections, conditions, contact };
  assertCommercialDataUnchanged(draft, content);
  return { content, report };
}

export function describeReport(r: ContentReport): string {
  const parts = [`Quotation notes: ${r.quotationNotes.approved.length} approved, ${r.quotationNotes.withheld.length} withheld, ${r.quotationNotes.marketVariants.length} market variant, ${r.missingSectionWording.length} missing. Wording registry: ${r.approvedDescribed} approved, ${r.reviewedDraft.length} reviewed drafts, ${r.draftOnly.length} draft-only (held back), ${r.missingDescriptions.length} missing, of ${r.items} packages`];
  if (r.missingConditions) parts.push("terms blocks not yet supplied");
  if (r.missingContact) parts.push("contact lines not yet supplied");
  if (r.approvalBlockers.length) parts.push(`${r.approvalBlockers.length} approval blocker(s)`);
  if (r.rejected.length) parts.push(`${r.rejected.length} registry entries rejected`);
  if (r.unknownKeys.length) parts.push(`${r.unknownKeys.length} unknown registry keys`);
  return parts.join("; ") + ".";
}
