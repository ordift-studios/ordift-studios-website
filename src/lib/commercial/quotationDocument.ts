import { createHash } from "node:crypto";
import { formatDate } from "./quotationValidity";
import type { ContactSnapshot } from "@/lib/brand/letterheadContacts";

// The CONTENT of an issued ORDINARY quotation document, and its fingerprint. Pure and dependency-light: no database, no network, nothing is sent or stored here.
//
// Why a fingerprint: only the contracting entity's legal details are frozen by the database at issue (migration 0172). The lines, amounts and terms live in ordinary rows that the
// application only ever lets a person edit while the quotation is a draft. A fingerprint of everything a client reads on the document, recorded when the quotation is issued and
// printed on every PDF, makes any later change to an issued quotation DETECTABLE (the page warns, the PDF refuses to build). It cannot PREVENT a direct database write: that
// would need a database guard on the item rows, which is a migration and is deliberately not part of this change.
//
// What is fingerprinted: reference, version, currency, issue date, validity, the frozen entity, the activities declared at issue, every line, the totals and the payment/booking terms.
// What is NOT: the status (it legitimately moves from issued to accepted), the client's contact block (it can be corrected or linked to a client record after issue) and internal notes.

export const DOCUMENT_SCHEMA = 1 as const;
const FINGERPRINT_DOMAIN = "ORDIFT-QUOTATION-CONTENT-V1\n";

export type QuotationDocumentItem = {
  service: string; description: string | null; quantity: number; unitBasis: string; rate: number;
  discountPercent: number | null; taxPercent: number | null; lineTotal: number;
};

export type QuotationDocumentContent = {
  schema: typeof DOCUMENT_SCHEMA;
  reference: string; version: number; currency: string;
  issuedAt: string; validUntil: string | null;
  entity: { legalName: string; registrationType: string | null; identifiers: { label: string; identifier: string }[] };
  activities: { key: string; label: string }[];
  items: QuotationDocumentItem[];
  subtotal: number; discountTotal: number; taxTotal: number; total: number;
  paymentBookingTerms: string | null;
};

// What is shown but not fingerprinted.
export type QuotationDocumentParty = { name: string | null; company: string | null; email: string | null; phone: string | null };
// `jurisdiction` is the contracting entity's own jurisdiction (it selects the letterhead's contact details); like the status and the client block it is presentation, not fingerprinted content.
// `contacts` are the letterhead contact details as printed; `contactsFrozen` says whether they come from the snapshot written when the quotation was issued (true) or, for a quotation issued
// before snapshots existed, from the current configuration (false: the page says so).
export type QuotationDocumentContext = { status: string; party: QuotationDocumentParty; today: string; jurisdiction: string | null; contacts: ContactSnapshot; contactsFrozen: boolean };

const money = (n: number): string => (Math.round(Number(n) * 100) / 100).toFixed(2);
const qty = (n: number): string => String(Number(n));
const pct = (n: number | null): string | null => (n === null || n === undefined ? null : String(Number(n)));

// Stable text for the content: fixed key order, money to two decimals, no insignificant whitespace. Two documents with the same content always give the same text.
export function canonicalContent(c: QuotationDocumentContent): string {
  const canonical = {
    schema: c.schema, reference: c.reference, version: c.version, currency: c.currency,
    issuedAt: c.issuedAt, validUntil: c.validUntil,
    entity: { legalName: c.entity.legalName, registrationType: c.entity.registrationType, identifiers: c.entity.identifiers.map((i) => ({ label: i.label, identifier: i.identifier })) },
    activities: c.activities.map((a) => a.key).sort(),
    items: c.items.map((i) => ({ service: i.service, description: i.description ?? null, quantity: qty(i.quantity), unitBasis: i.unitBasis, rate: money(i.rate), discountPercent: pct(i.discountPercent), taxPercent: pct(i.taxPercent), lineTotal: money(i.lineTotal) })),
    totals: { subtotal: money(c.subtotal), discount: money(c.discountTotal), tax: money(c.taxTotal), total: money(c.total) },
    paymentBookingTerms: c.paymentBookingTerms ?? null,
  };
  return JSON.stringify(canonical);
}

export function contentFingerprint(c: QuotationDocumentContent): string {
  return createHash("sha256").update(FINGERPRINT_DOMAIN + canonicalContent(c)).digest("hex");
}

// The pieces the document is built from (structurally the issued quotation as the detail loader returns it, plus the frozen entity and the declared activities).
export type DocumentSource = {
  reference: string; version: number; currency: string; issuedAt: string; validUntil: string | null;
  subtotal: number; discountTotal: number; taxTotal: number; total: number; paymentBookingTerms: string | null;
  items: { serviceItem: string; description: string | null; quantity: number; unitBasis: string; sellingRate: number; discountPercent: number | null; taxPercent: number | null; lineTotal: number }[];
  entity: QuotationDocumentContent["entity"];
  declaredActivities: string[]; activityLabels: Record<string, string>;
};

export function buildDocumentContent(s: DocumentSource): QuotationDocumentContent {
  return {
    schema: DOCUMENT_SCHEMA, reference: s.reference, version: s.version, currency: s.currency, issuedAt: s.issuedAt, validUntil: s.validUntil ? s.validUntil.slice(0, 10) : null,
    entity: { legalName: s.entity.legalName, registrationType: s.entity.registrationType, identifiers: s.entity.identifiers },
    activities: [...new Set(s.declaredActivities)].sort().map((key) => ({ key, label: s.activityLabels[key] ?? key })),
    items: s.items.map((i) => ({ service: i.serviceItem, description: i.description, quantity: i.quantity, unitBasis: i.unitBasis, rate: i.sellingRate, discountPercent: i.discountPercent, taxPercent: i.taxPercent, lineTotal: i.lineTotal })),
    subtotal: s.subtotal, discountTotal: s.discountTotal, taxTotal: s.taxTotal, total: s.total, paymentBookingTerms: s.paymentBookingTerms,
  };
}

export const isFingerprint = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

// Four groups of four for reading aloud or typing: the first 16 hex characters of the full fingerprint.
export function shortFingerprint(full: string): string {
  return (full.slice(0, 16).match(/.{4}/g) ?? [full]).join(" ");
}

export type Drift = { state: "unchanged" } | { state: "changed"; recorded: string; current: string } | { state: "no_baseline" };
export function compareToBaseline(baseline: string | null, current: string): Drift {
  if (!baseline) return { state: "no_baseline" };
  return baseline === current ? { state: "unchanged" } : { state: "changed", recorded: baseline, current };
}

export const DRIFT_MESSAGE = "The content of this issued quotation no longer matches the fingerprint recorded when it was issued. Do not send it until a Super Admin has reviewed what changed. An issued quotation is changed by revising it, not by editing it.";

export function documentBanner(status: string, validUntil: string | null, today: string): string | null {
  if (status === "expired" || (status === "sent" && validUntil && validUntil.slice(0, 10) < today)) return "EXPIRED: no longer open for acceptance";
  if (status === "superseded") return "SUPERSEDED: replaced by a later version";
  if (status === "declined") return "DECLINED";
  return null;
}

export const formatAmount = (currency: string, n: number): string =>
  `${currency} ${(Math.round(Number(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatIssueDate = (iso: string): string => formatDate(iso.slice(0, 10));

export function documentFileName(reference: string, fingerprint: string): string {
  return `${reference.replace(/[^A-Za-z0-9._-]+/g, "-")}-${fingerprint.slice(0, 8)}.pdf`;
}
