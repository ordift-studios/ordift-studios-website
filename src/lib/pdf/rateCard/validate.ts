import { checkConversions } from "./convert";
import { validateCover } from "./cover";
import { checkBinding } from "./jurisdictions";
import { PLACEHOLDER_MARK, type PriceSpec, type RateCardContent } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export type Validation = { errors: string[]; warnings: string[] };
export type ValidateOptions = {
  today?: string;                         // YYYY-MM-DD, for the exchange-rate freshness check
  currencyPolicyApproved?: boolean;       // the Founder's quotation/payment currency policy (code constant; false until approved)
};

// The ONLY keys a rate card may contain. Anything else (a cost, margin, supplier rate, internal allocation …) smuggled into the JSON is rejected at approval, whatever it is called.
const ALLOWED: Record<string, readonly string[]> = {
  root: ["meta", "coverImage", "cover", "intro", "sections", "conditions", "contact"],
  meta: ["title", "subtitle", "editionLabel", "effectiveDate", "marketSlug", "marketName", "currency", "conversionPolicy", "fx", "issuingEntity"],
  fx: ["currency", "rateToUsd", "effectiveFrom", "source", "rule"], rule: ["kind", "multiple"], issuingEntity: ["entityId", "jurisdiction", "name", "checkedOn", "licensedActivities", "basis"],
  cover: ["variant", "focusY", "photoLabel", "cleared", "clearedNote"],
  section: ["key", "title", "intro", "structure", "items", "minimum", "addons", "notes", "customQuotationNote"],
  item: ["key", "name", "description", "specs", "inclusions", "price", "conversion", "tiers", "note", "source", "activities", "included", "eligibility"],
  addon: ["name", "price", "conversion", "note", "activities", "included", "eligibility"], minimum: ["label", "price", "conversion"], tier: ["label", "price", "conversion"],
  price: ["kind", "amount", "unit"], conversion: ["usdReference", "rateToUsd", "exact", "rounded", "difference"], eligibility: ["ok", "reason"], note: ["title", "text"], contact: ["label", "value"],
};
export function unknownKeys(c: RateCardContent): string[] {
  const bad: string[] = []; const chk = (kind: string, o: unknown, where: string) => {
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o as object)) if (!ALLOWED[kind].includes(k)) bad.push(`${where}.${k}`);
  };
  chk("root", c, "card"); chk("meta", c.meta, "meta"); chk("fx", c.meta?.fx, "meta.fx"); chk("rule", c.meta?.fx?.rule, "meta.fx.rule"); chk("issuingEntity", c.meta?.issuingEntity, "meta.issuingEntity"); chk("cover", c.cover, "cover");
  const price = (p: unknown, w: string) => chk("price", p, w);
  c.sections?.forEach((s, si) => {
    const sw = `sections[${si}]`; chk("section", s, sw);
    s.items?.forEach((i, ii) => { const w = `${sw}.items[${ii}]`; chk("item", i, w); price(i.price, `${w}.price`); chk("conversion", i.conversion, `${w}.conversion`); chk("eligibility", i.eligibility, `${w}.eligibility`); i.tiers?.forEach((t, ti) => { chk("tier", t, `${w}.tiers[${ti}]`); price(t.price, `${w}.tiers[${ti}].price`); chk("conversion", t.conversion, `${w}.tiers[${ti}].conversion`); }); });
    if (s.minimum) { chk("minimum", s.minimum, `${sw}.minimum`); price(s.minimum.price, `${sw}.minimum.price`); chk("conversion", s.minimum.conversion, `${sw}.minimum.conversion`); }
    s.addons?.forEach((a, ai) => { const w = `${sw}.addons[${ai}]`; chk("addon", a, w); price(a.price, `${w}.price`); chk("conversion", a.conversion, `${w}.conversion`); chk("eligibility", a.eligibility, `${w}.eligibility`); });
  });
  c.conditions?.forEach((x, i) => chk("note", x, `conditions[${i}]`)); c.contact?.forEach((x, i) => chk("contact", x, `contact[${i}]`));
  return bad;
}

function strings(v: unknown, out: string[] = []): string[] { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out)); return out; }
export const placeholderCount = (c: RateCardContent): number => strings(c).filter((s) => s.includes(PLACEHOLDER_MARK)).length;

const priceProblem = (label: string, p: PriceSpec): string | null => {
  if (p.kind === "on_request") return null;
  if (!Number.isFinite(p.amount) || p.amount <= 0) return `“${label}”: enter a price above zero, or choose “Price on request”.`;
  if (Math.round(p.amount * 100) !== p.amount * 100) return `“${label}”: a price has at most two decimals.`;
  return null;
};

// A DRAFT only has to be renderable. APPROVAL (a frozen edition) additionally requires approved wording for every item, no placeholder text or items, conditions and contact details,
// an honest currency basis, a clean eligibility check and nothing but the allowed fields.
export function validateRateCard(c: RateCardContent, mode: "draft" | "approval", opts: ValidateOptions = {}): Validation {
  const errors: string[] = []; const warnings: string[] = [];
  const hard = mode === "approval" ? errors : warnings;
  const m = c.meta;
  if (!m.title.trim()) errors.push("Enter the rate card title.");
  if (!m.editionLabel.trim()) errors.push("Enter the edition label (for example “2026 Edition 1”).");
  if (!ISO.test(m.effectiveDate)) errors.push("Enter the effective date as YYYY-MM-DD.");
  if (!/^[A-Z]{3}$/.test(m.currency)) errors.push("Enter the currency as a three-letter code (for example USD).");
  if (!m.marketName.trim()) errors.push("Name the market the prices apply to.");
  if (c.sections.length === 0) errors.push("Add at least one service category.");
  const seen = new Set<string>();
  const live = c.sections.map((s) => ({ ...s, items: s.items.filter((i) => i.included !== false) }));
  for (const s of c.sections) {
    if (!s.title.trim()) errors.push("Every service category needs a title.");
    if (s.items.length === 0) errors.push(`“${s.title || s.key}” has no items.`);
    for (const i of s.items) {
      if (seen.has(`${s.key}/${i.key}`)) errors.push(`“${i.name}” appears twice in “${s.title}”.`); seen.add(`${s.key}/${i.key}`);
      if (!i.name.trim()) errors.push(`An item in “${s.title}” has no name.`);
      const p = priceProblem(i.name || i.key, i.price); if (p) errors.push(p);
      i.tiers?.forEach((t) => { const tp = priceProblem(`${i.name} — ${t.label}`, t.price); if (tp) errors.push(tp); });
      if (s.structure === "fixed" && i.price.kind === "from") errors.push(`“${i.name}”: “${s.title}” is a fixed-price category, so a starting price is not allowed.`);
      if (s.structure === "from" && i.price.kind === "fixed") errors.push(`“${i.name}”: “${s.title}” uses starting prices, so a fixed price is not allowed.`);
      if (i.included !== false) {
        if (!i.description.trim()) hard.push(`“${i.name || i.key}” has no approved service description yet.`);
        if (i.source === "placeholder") hard.push(`“${i.name || i.key}” is placeholder content and cannot be approved.`);
        if (i.eligibility && !i.eligibility.ok) hard.push(`“${i.name}” is not eligible for publication: ${i.eligibility.reason}`);
      }
    }
    if (s.minimum) { const p = priceProblem(s.minimum.label, s.minimum.price); if (p) errors.push(p); }
    for (const a of s.addons ?? []) { const p = priceProblem(a.name, a.price); if (p) errors.push(p); if (a.included !== false && a.eligibility && !a.eligibility.ok) hard.push(`“${a.name}” is not eligible for publication: ${a.eligibility.reason}`); }
  }
  if (live.every((s) => s.items.length === 0) && c.sections.length > 0) errors.push("Every item is excluded, so there is nothing to publish.");

  // currency honesty
  for (const e of checkConversions(c, opts.today ?? m.effectiveDate)) (/days old/.test(e) ? hard : errors).push(e);
  if (m.currency !== "USD") {
    if (m.conversionPolicy !== "proposed" && m.conversionPolicy !== "approved") errors.push(`A ${m.currency} card must be marked as proposed or approved currency conversion.`);
    if (mode === "approval" && (m.conversionPolicy !== "approved" || opts.currencyPolicyApproved !== true)) errors.push(`${m.currency} figures stay proposed / indicative until the Founder approves the quotation and payment currency policy, so a ${m.currency} card cannot be approved for clients yet.`);
  }

  for (const e of checkBinding({ marketSlug: m.marketSlug, currency: m.currency, entityJurisdiction: m.issuingEntity?.jurisdiction ?? null, hasEntity: !!m.issuingEntity })) errors.push(e);
  if (m.issuingEntity?.basis) warnings.push(`Licensed activities rest on: ${m.issuingEntity.basis}`);

  const pc = placeholderCount(c);
  if (pc > 0) hard.push(`${pc} text field(s) still contain placeholder wording (${PLACEHOLDER_MARK}) that needs Founder-approved text.`);
  const unknown = unknownKeys(c);
  if (unknown.length) errors.push(`The content contains fields that a rate card may not carry: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ` and ${unknown.length - 5} more` : ""}.`);

  const cv = validateCover(c, mode); errors.push(...cv.errors); warnings.push(...cv.warnings);

  if (mode === "approval") {
    if (c.conditions.length === 0 || c.conditions.some((x) => !x.text.trim())) errors.push("Add the approved conditions (validity, tax, deposits, usage terms) before approval.");
    if (c.contact.length === 0) errors.push("Add the contact and booking details before approval.");
    if (!c.coverImage.trim()) errors.push("Choose the cover image.");
    if (!m.issuingEntity) errors.push("Record which legal entity offers these prices and its verified licensed activities before approval.");
  }
  return { errors, warnings };
}
