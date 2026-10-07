// Crew Support quotation rules (Phase 2) — pure and directly testable.

import { parseInstant } from "@/lib/shared/instant";

export const ACCEPTANCE_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "whatsapp_message", label: "WhatsApp / message" },
  { value: "telephone", label: "Telephone" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other documented channel" },
] as const;
export type AcceptanceChannel = (typeof ACCEPTANCE_CHANNELS)[number]["value"];

export type EditableLine = {
  requirementId: string | null;
  serviceItem: string;
  description: string;
  quantity: number;
  unitBasis: string;
  sellingRate: number;
  discountPercent: number | null;
  taxPercent: number | null;
  governedUnitPrice: number | null;
  adjustmentReason: string;
  sourceReference: string | null;
};

export type ResolvedLine = EditableLine & { sourceType: "pricing" | "manual" | "adjusted"; noGovernedRate: boolean };

// Client-visible text must never carry internal cost language. This is a
// guard against an easy mistake, not a substitute for the structural
// separation (no cost column exists on these tables).
const FORBIDDEN_CLIENT_TEXT = /\b(margin|profit|markup|mark-up|crew (pay|cost|rate)|contractor (pay|cost|rate)|vendor (pay|cost|rate)|payable|our cost|internal)\b/i;

export function validateAndResolveLines(lines: EditableLine[]): { ok: true; lines: ResolvedLine[] } | { ok: false; error: string } {
  if (lines.length === 0) return { ok: false, error: "A quotation needs at least one line." };
  const resolved: ResolvedLine[] = [];
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    if (!l.serviceItem.trim()) return { ok: false, error: `Line ${n}: enter what is being quoted.` };
    if (!(l.quantity > 0)) return { ok: false, error: `Line ${n}: quantity must be greater than zero.` };
    if (!(l.sellingRate >= 0) || !Number.isFinite(l.sellingRate)) return { ok: false, error: `Line ${n}: enter a valid price.` };
    if (l.discountPercent !== null && !(l.discountPercent >= 0 && l.discountPercent <= 100)) return { ok: false, error: `Line ${n}: discount must be 0–100%.` };
    if (l.taxPercent !== null && !(l.taxPercent >= 0)) return { ok: false, error: `Line ${n}: tax can't be negative.` };
    if (FORBIDDEN_CLIENT_TEXT.test(`${l.serviceItem} ${l.description}`)) return { ok: false, error: `Line ${n}: client-facing text can't mention internal costs, margins or payables.` };

    if (l.governedUnitPrice !== null) {
      if (l.sellingRate !== l.governedUnitPrice) {
        if (l.adjustmentReason.trim().length < 5) return { ok: false, error: `Line ${n}: the price differs from the governed rate — enter an adjustment reason.` };
        resolved.push({ ...l, sourceType: "adjusted", noGovernedRate: false });
      } else {
        resolved.push({ ...l, adjustmentReason: "", sourceType: "pricing", noGovernedRate: false });
      }
    } else {
      resolved.push({ ...l, adjustmentReason: "", sourceType: "manual", noGovernedRate: true });
    }
  }
  return { ok: true, lines: resolved };
}

// Quotation validity. The pre-filled DEFAULT is 14 calendar days (set by
// the business owner, 2026-10-07) — a convenience, not a fixed policy:
// authorized staff can choose any future date per quotation, and an
// issued quotation must always carry one (the register's "Valid until"
// column was blank in QA). This single constant is the only place the
// period is defined; nothing else hard-codes it. Existing quotations
// without a date are never back-filled by a migration.
export const DEFAULT_QUOTATION_VALIDITY_DAYS = 14;

export function defaultValidUntil(now: Date, days = DEFAULT_QUOTATION_VALIDITY_DAYS): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

export function canMarkReady(params: { status: string; total: number; lineCount: number; validUntil: string | null; today: string }): { ok: true } | { ok: false; reason: string } {
  if (params.status !== "draft") return { ok: false, reason: "Only a draft quotation can be marked ready." };
  if (params.lineCount === 0) return { ok: false, reason: "Add at least one line first." };
  if (!(params.total > 0)) return { ok: false, reason: "The total must be greater than zero — enter prices for every line (no governed rate exists for manual lines)." };
  if (!params.validUntil) return { ok: false, reason: "Set a “Valid until” date before marking the quotation ready." };
  if (params.validUntil < params.today) return { ok: false, reason: "The “Valid until” date is already in the past — choose a future date." };
  return { ok: true };
}

export function validateAcceptance(params: { status: string; validUntil: string | null; today: string }): { ok: true } | { ok: false; reason: string } {
  if (params.status === "accepted") return { ok: false, reason: "This quotation has already been accepted." };
  if (params.status !== "sent") return { ok: false, reason: "This quotation isn't open for acceptance." };
  if (params.validUntil && params.validUntil < params.today) return { ok: false, reason: "This quotation has expired. Please ask Ordift for an updated one." };
  return { ok: true };
}

export function validateStaffAcceptance(params: {
  channel: string;
  evidence: string;
  acceptedByName: string;
  receivedAt: string;
  now: Date;
  issuedAt: string | null;
}): { ok: true; receivedAtIso: string } | { ok: false; reason: string } {
  if (!ACCEPTANCE_CHANNELS.some((c) => c.value === params.channel)) return { ok: false, reason: "Choose how the acceptance was received." };
  if (params.acceptedByName.trim().length < 2) return { ok: false, reason: "Enter who accepted on the client's side." };
  if (params.evidence.trim().length < 10) return { ok: false, reason: "Describe the evidence or reference (for example the email date or message), at least 10 characters." };
  if (!params.receivedAt.trim()) return { ok: false, reason: "Enter when the acceptance was received." };
  const received = parseInstant(params.receivedAt);
  if (!received) return { ok: false, reason: "The received time wasn't understood — pick it again from the date/time field." };
  if (received.getTime() > params.now.getTime() + 5 * 60_000) return { ok: false, reason: "The acceptance can't be dated in the future (compared as an exact moment, in your own timezone)." };
  if (params.issuedAt && received.getTime() < new Date(params.issuedAt).getTime() - 60_000) return { ok: false, reason: "The acceptance can't pre-date the quotation being issued." };
  return { ok: true, receivedAtIso: received.toISOString() };
}

// What the CLIENT may see. A strict whitelist projection — nothing is
// copied by spreading the database row, so a future internal column can
// never leak by accident.
export type QuotationRowForClient = {
  quotation_reference: string;
  status: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  valid_until: string | null;
  payment_booking_terms: string | null;
  issued_at: string | null;
  accepted_at: string | null;
  usd_total: number | null;
  fx_currency: string | null;
  fx_rate_to_usd: number | null;
  fx_locked_at: string | null;
};
export type QuotationItemRowForClient = { service_item: string; description: string | null; quantity: number; unit_basis: string; selling_rate: number; discount_percent: number | null; tax_percent: number | null; line_total: number };

export type ClientQuotationView = {
  reference: string;
  status: "sent" | "accepted";
  currency: string;
  lines: { item: string; description: string | null; quantity: number; unitBasis: string; rate: number; discountPercent: number | null; taxPercent: number | null; lineTotal: number }[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  validUntil: string | null;
  terms: string | null;
  issuedAt: string | null;
  acceptedAt: string | null;
  localEquivalent: { currency: string; amount: number; rate: number; lockedAt: string | null } | null;
};

export function toClientQuotationView(q: QuotationRowForClient, items: QuotationItemRowForClient[]): ClientQuotationView {
  const local = q.fx_currency && q.fx_rate_to_usd && q.usd_total != null ? { currency: q.fx_currency, amount: Math.round(q.usd_total * q.fx_rate_to_usd * 100) / 100, rate: q.fx_rate_to_usd, lockedAt: q.fx_locked_at } : null;
  return {
    reference: q.quotation_reference,
    status: q.status === "accepted" ? "accepted" : "sent",
    currency: q.currency,
    lines: items.map((i) => ({ item: i.service_item, description: i.description, quantity: Number(i.quantity), unitBasis: i.unit_basis, rate: Number(i.selling_rate), discountPercent: i.discount_percent, taxPercent: i.tax_percent, lineTotal: Number(i.line_total) })),
    subtotal: Number(q.subtotal),
    discountTotal: Number(q.discount_total),
    taxTotal: Number(q.tax_total),
    total: Number(q.total),
    validUntil: q.valid_until,
    terms: q.payment_booking_terms,
    issuedAt: q.issued_at,
    acceptedAt: q.accepted_at,
    localEquivalent: local,
  };
}
