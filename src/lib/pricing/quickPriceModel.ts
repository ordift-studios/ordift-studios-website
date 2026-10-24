import { decodePricingHandoff } from "@/lib/enquiry/pricingHandoff";
import { applyDiscount } from "./discountMath";

// Pure model for the Enquiries & Quick Pricing negotiation workspace. It adds NO pricing logic of its own: the figures come from the governed
// estimators (read from the structured booking handoff each estimator already builds), and discounts reuse the existing applyDiscount().
// Everything here is a temporary, in-browser preview: nothing is saved, approved, sent or posted.

export type Captured =
  | { status: "priced"; title: string; lines: string[]; totalUsd: number }
  | { status: "indicative"; title: string; lines: string[]; totalUsd: number } // an indicative fee, not a total (for example Production Services)
  | { status: "unpriced"; reason: string };

const TOTAL = /^(?:Estimated Total|Total):\s*\$\s*([\d,]+(?:\.\d+)?)/i;
const INDICATIVE = /^Ordift Fee \(indicative\):\s*\$\s*([\d,]+(?:\.\d+)?)/i;
const num = (s: string) => Number(s.replace(/,/g, ""));

// Reads the structured summary an estimator puts in its booking link. A link with no summary means the estimator could not price the selection
// (missing rate, below minimum or custom proposal): that is reported as unpriced, never as zero.
export function captureFromHref(href: string | null | undefined): Captured {
  if (!href) return { status: "unpriced", reason: "No calculator result yet." };
  let token: string | null = null;
  try { token = new URL(href, "https://x.invalid").searchParams.get("pricing"); } catch { token = null; }
  const handoff = decodePricingHandoff(token);
  if (!handoff) return { status: "unpriced", reason: "This selection cannot be priced automatically (a rate is not published for it, or it needs a custom proposal). No price has been assumed." };
  for (const line of handoff.summaryLines) {
    const m = TOTAL.exec(line);
    if (m) return { status: "priced", title: handoff.summaryTitle, lines: handoff.summaryLines, totalUsd: num(m[1]) };
  }
  for (const line of handoff.summaryLines) {
    const m = INDICATIVE.exec(line);
    if (m) return { status: "indicative", title: handoff.summaryTitle, lines: handoff.summaryLines, totalUsd: num(m[1]) };
  }
  return { status: "unpriced", reason: "The calculator did not return a total for this selection." };
}

const isTotalLine = (l: string) => TOTAL.test(l) || INDICATIVE.test(l);

export type Comparison = {
  differenceUsd: number | null; // revised minus original; null unless both are priced totals
  direction: "higher" | "lower" | "same" | "unknown";
  onlyInOriginal: string[]; // what the client gives up
  onlyInRevised: string[]; // what the client gains
};

export function compareOptions(original: Captured, revised: Captured): Comparison {
  if (original.status === "unpriced" || revised.status === "unpriced") return { differenceUsd: null, direction: "unknown", onlyInOriginal: [], onlyInRevised: [] };
  const a = original.lines.filter((l) => !isTotalLine(l));
  const b = revised.lines.filter((l) => !isTotalLine(l));
  const comparable = original.status === "priced" && revised.status === "priced";
  const diff = comparable ? Math.round((revised.totalUsd - original.totalUsd) * 100) / 100 : null;
  return {
    differenceUsd: diff,
    direction: diff === null ? "unknown" : diff > 0 ? "higher" : diff < 0 ? "lower" : "same",
    onlyInOriginal: a.filter((l) => !b.includes(l)),
    onlyInRevised: b.filter((l) => !a.includes(l)),
  };
}

export type DiscountInput = { type: "percentage" | "fixed"; value: number; reason: string };
export type DiscountPreview =
  | { ok: true; eligibleSubtotalUsd: number; discountUsd: number; totalUsd: number }
  | { ok: false; error: string };

// A PREVIEW only. It enforces the arithmetic rules (valid percentage, positive amount, never a negative or zero total) and requires a reason.
// It invents no limit and records no approval: authority to grant a discretionary discount rests with the Founder / Super Admin.
export function previewDiscount(option: Captured, d: DiscountInput): DiscountPreview {
  if (option.status !== "priced") return { ok: false, error: option.status === "indicative" ? "This is an indicative fee, not a total, so a discount cannot be previewed on it." : "There is no price to discount." };
  if (!Number.isFinite(d.value) || d.value <= 0) return { ok: false, error: "Enter a discount greater than zero." };
  if (d.type === "percentage" && d.value >= 100) return { ok: false, error: "A percentage discount must be below 100%." };
  if (d.type === "fixed" && d.value >= option.totalUsd) return { ok: false, error: "A fixed discount cannot equal or exceed the total: the result would be zero or negative." };
  if (d.reason.trim().length < 10) return { ok: false, error: "A reason is required (at least a short sentence)." };
  const { discountAmountUsd, finalAmountUsd } = applyDiscount(option.totalUsd, { discountType: d.type, value: d.value });
  if (finalAmountUsd <= 0) return { ok: false, error: "The result would be zero or negative." };
  return { ok: true, eligibleSubtotalUsd: option.totalUsd, discountUsd: discountAmountUsd, totalUsd: finalAmountUsd };
}

export type DiscountState = "none" | "proposed_needs_approval" | "preview_confirm_in_quotation";
export function discountState(preview: DiscountPreview | null, isSuperAdmin: boolean): DiscountState {
  if (!preview || !preview.ok) return "none";
  return isSuperAdmin ? "preview_confirm_in_quotation" : "proposed_needs_approval";
}

const usd = (n: number) => `$${n.toFixed(2)} USD`;

// Plain-text summary for the staff member to paste. A scope change versus the original is shown SEPARATELY from any discount, and a discount is
// always worded as proposed / subject to approval - this preview is never an approved discount.
export function buildClientSummary(option: Captured, opts: { label: string; original?: Captured | null; originalLabel?: string; discount?: DiscountPreview | null; discountInput?: DiscountInput | null }): string {
  if (option.status === "unpriced") return "";
  const out = [`Ordift Studios — estimate (${opts.label})`, option.title, ...option.lines.filter((l) => !isTotalLine(l)).map((l) => `• ${l}`)];
  out.push(option.status === "priced" ? `Estimated total: ${usd(option.totalUsd)}` : `Indicative Ordift fee: ${usd(option.totalUsd)} (not a total)`);
  if (opts.original && opts.original.status === "priced" && option.status === "priced" && opts.original !== option) {
    const diff = Math.round((option.totalUsd - opts.original.totalUsd) * 100) / 100;
    if (diff !== 0) out.push(`Change in scope from ${opts.originalLabel ?? "the original option"}: ${diff < 0 ? "−" : "+"}${usd(Math.abs(diff))} (a change in what is included, not a discount)`);
  }
  if (opts.discount && opts.discount.ok && opts.discountInput) {
    out.push(`Proposed discount: −${usd(opts.discount.discountUsd)} (${opts.discountInput.type === "percentage" ? `${opts.discountInput.value}%` : "fixed amount"}; subject to Ordift approval)`);
    out.push(`Estimated total after proposed discount: ${usd(opts.discount.totalUsd)}`);
  }
  out.push("This is an estimate, not a formal quotation. A formal quotation and booking confirmation follow if you wish to proceed.");
  return out.join("\n");
}
