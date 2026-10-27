import type { RateCardContent, RateCardItem } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export type Validation = { errors: string[]; warnings: string[] };

const priceProblem = (i: RateCardItem): string | null => {
  if (i.price.kind === "on_request") return null;
  const a = i.price.amount;
  if (!Number.isFinite(a) || a <= 0) return `“${i.name || i.key}”: enter a price above zero, or choose “Price on request”.`;
  if (Math.round(a * 100) !== a * 100) return `“${i.name || i.key}”: a price has at most two decimals.`;
  return null;
};

// A DRAFT only has to be renderable. APPROVAL (a frozen edition) additionally requires approved wording for every item, no placeholder content, conditions and contact details.
export function validateRateCard(c: RateCardContent, mode: "draft" | "approval"): Validation {
  const errors: string[] = []; const warnings: string[] = [];
  const m = c.meta;
  if (!m.title.trim()) errors.push("Enter the rate card title.");
  if (!m.editionLabel.trim()) errors.push("Enter the edition label (for example “2026 Edition 1”).");
  if (!ISO.test(m.effectiveDate)) errors.push("Enter the effective date as YYYY-MM-DD.");
  if (!/^[A-Z]{3}$/.test(m.currency)) errors.push("Enter the currency as a three-letter code (for example USD).");
  if (!m.marketName.trim()) errors.push("Name the market the prices apply to.");
  if (c.sections.length === 0) errors.push("Add at least one service category.");
  const seen = new Set<string>();
  for (const s of c.sections) {
    if (!s.title.trim()) errors.push("Every service category needs a title.");
    if (s.items.length === 0) errors.push(`“${s.title || s.key}” has no items.`);
    for (const i of s.items) {
      if (seen.has(`${s.key}/${i.key}`)) errors.push(`“${i.name}” appears twice in “${s.title}”.`); seen.add(`${s.key}/${i.key}`);
      if (!i.name.trim()) errors.push(`An item in “${s.title}” has no name.`);
      const p = priceProblem(i); if (p) errors.push(p);
      if (s.structure === "fixed" && i.price.kind === "from") errors.push(`“${i.name}”: “${s.title}” is a fixed-price category, so a starting price is not allowed.`);
      if (s.structure === "from" && i.price.kind === "fixed") errors.push(`“${i.name}”: “${s.title}” uses starting prices, so a fixed price is not allowed.`);
      if (!i.description.trim()) (mode === "approval" ? errors : warnings).push(`“${i.name || i.key}” has no approved service description yet.`);
      if (i.source === "placeholder") (mode === "approval" ? errors : warnings).push(`“${i.name || i.key}” is placeholder content and cannot be approved.`);
    }
  }
  if (mode === "approval") {
    if (c.conditions.length === 0 || c.conditions.some((x) => !x.text.trim())) errors.push("Add the approved conditions (validity, tax, deposits, usage terms) before approval.");
    if (c.contact.length === 0) errors.push("Add the contact and booking details before approval.");
    if (!c.coverImage.trim()) errors.push("Choose the cover image.");
  }
  return { errors, warnings };
}
