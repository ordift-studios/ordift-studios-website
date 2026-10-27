import { createHash } from "node:crypto";

// Legal-entity registry rules (pure). One legal entity = one set of registrations, permits, documents, signatories and expenses;
// Ghana and Qatar are separate entities under the same brand and never share a record. Nothing here reads or writes the database.

export const REGISTRATION_KINDS = [
  "commercial_registration", "commercial_permit", "tax_registration", "establishment_card",
  "trade_name_reservation", "articles_of_association", "chamber_membership", "investment_approval_condition", "activity_licence",
] as const;
export type RegistrationKind = (typeof REGISTRATION_KINDS)[number];
export type RegistrationStatus = "active" | "pending" | "not_issued" | "expired" | "superseded" | "revoked";

export const REGISTRATION_LABELS: Record<RegistrationKind, string> = {
  commercial_registration: "Commercial Registration (CR)",
  commercial_permit: "Commercial Permit / Licence",
  tax_registration: "Tax registration",
  establishment_card: "Establishment Card",
  trade_name_reservation: "Trade name reservation",
  articles_of_association: "Articles of Association",
  chamber_membership: "Chamber of Commerce membership",
  investment_approval_condition: "Investment approval condition",
  activity_licence: "Activity licence / authorisation",
};

// Canonical document classes for the private vault. Free text is still accepted for older records (e.g. the Ghana certificate).
export const ENTITY_DOCUMENT_TYPES = [
  { value: "commercial_registration", label: "Commercial Registration" },
  { value: "articles_of_association", label: "Articles of Association" },
  { value: "establishment_card", label: "Establishment Card" },
  { value: "tax_card", label: "Tax Card" },
  { value: "trade_name_reservation", label: "Trade Name Reservation Certificate" },
  { value: "investment_application", label: "Investment / incorporation application form" },
  { value: "government_receipt", label: "Government payment receipt" },
  { value: "supplier_invoice", label: "Supplier / vendor invoice (including software and subscriptions)" },
  { value: "purchase_receipt", label: "Purchase receipt" },
  { value: "other_financial_document", label: "Other financial supporting document" },
  { value: "commercial_permit", label: "Commercial Permit / Licence" },
  { value: "premises_document", label: "Business premises document" },
  { value: "other", label: "Other official document" },
] as const;
export type EntityDocumentType = (typeof ENTITY_DOCUMENT_TYPES)[number]["value"];
export const entityDocumentTypeLabel = (v: string) => ENTITY_DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v;

export const sha256OfBytes = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

// ------------------------------------------------------------------ duplicates (never destructive: the original is always kept)
export type KnownDocument = { id: string; sha256: string | null; documentType: string; filename: string | null };
export type DuplicateVerdict = { kind: "new" } | { kind: "exact_duplicate_of"; of: KnownDocument };

export function checkDuplicate(known: KnownDocument[], sha256: string): DuplicateVerdict {
  const hit = known.find((d) => d.sha256 === sha256);
  return hit ? { kind: "exact_duplicate_of", of: hit } : { kind: "new" };
}

// ------------------------------------------------------------------ dates
const DAY_MS = 86_400_000;
const parseDay = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
export const daysBetween = (fromIso: string, toIso: string): number => Math.round((parseDay(toIso) - parseDay(fromIso)) / DAY_MS);
export const DUE_SOON_DAYS = 90;

export type RegistrationFact = {
  id: string; kind: RegistrationKind; status: RegistrationStatus; identifier: string | null; issuedOn: string | null; expiresOn: string | null;
  facts: Record<string, unknown>; note: string | null; verifiedAt: string | null;
};

// ------------------------------------------------------------------ expiry and obligation tracking (computed at read time; no background job)
export type TrackedState = "ok" | "due_soon" | "overdue" | "pending" | "not_issued" | "date_unconfirmed" | "no_expiry";
export type TrackedItem = { registrationId: string; kind: RegistrationKind; label: string; state: TrackedState; expiresOn: string | null; daysRemaining: number | null; detail: string };

export function trackCompliance(registrations: RegistrationFact[], today: string): TrackedItem[] {
  const out: TrackedItem[] = [];
  for (const r of registrations) {
    if (r.status === "superseded" || r.status === "revoked") continue;
    const label = REGISTRATION_LABELS[r.kind];
    if (r.status === "not_issued") { out.push({ registrationId: r.id, kind: r.kind, label, state: "not_issued", expiresOn: null, daysRemaining: null, detail: "Not yet issued. Nothing has been recorded for it." }); continue; }
    if (r.kind === "investment_approval_condition" && r.status === "pending") {
      const start = typeof r.facts.approvalNoticeDate === "string" ? r.facts.approvalNoticeDate : null;
      const days = typeof r.facts.workingDays === "number" ? r.facts.workingDays : null;
      out.push({ registrationId: r.id, kind: r.kind, label, state: "date_unconfirmed", expiresOn: null, daysRemaining: null,
        detail: start ? `Must be operating ${days ?? "the stated number of"} working days after the approval notice of ${start}; the deadline is to be confirmed.` : `Must be operating within ${days ?? "the stated number of"} working days of the official approval notice. The notice date has not been recorded, so the deadline is unknown — confirm it.` });
      continue;
    }
    if (r.status === "pending") { out.push({ registrationId: r.id, kind: r.kind, label, state: "pending", expiresOn: null, daysRemaining: null, detail: "Pending." }); continue; }
    if (!r.expiresOn) { out.push({ registrationId: r.id, kind: r.kind, label, state: "no_expiry", expiresOn: null, daysRemaining: null, detail: "No expiry date is stated on the document." }); continue; }
    const left = daysBetween(today, r.expiresOn);
    const state: TrackedState = left < 0 ? "overdue" : left <= DUE_SOON_DAYS ? "due_soon" : "ok";
    out.push({ registrationId: r.id, kind: r.kind, label, state, expiresOn: r.expiresOn, daysRemaining: left, detail: left < 0 ? `Expired ${-left} day(s) ago.` : `Expires ${r.expiresOn} (${left} day(s)).` });
  }
  const rank: Record<TrackedState, number> = { overdue: 0, date_unconfirmed: 1, due_soon: 2, not_issued: 3, pending: 4, ok: 5, no_expiry: 6 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));
}

// ------------------------------------------------------------------ what the entity may be called, and what it may not
export type EntityStanding = {
  registered: boolean;            // a current, unexpired commercial registration is on record
  permitIssued: boolean;          // a commercial permit has actually been recorded with a number
  taxRegistered: boolean;
  registeredActivityCodes: string[];
  blockers: string[];             // why it must not be presented as fully operationally licensed
};

export function entityStanding(registrations: RegistrationFact[], today: string): EntityStanding {
  const cur = (k: RegistrationKind) => registrations.find((r) => r.kind === k && (r.status === "active" || r.status === "pending" || r.status === "not_issued"));
  const cr = cur("commercial_registration");
  const permit = cur("commercial_permit");
  const tax = cur("tax_registration");
  const registered = Boolean(cr && cr.status === "active" && cr.identifier && (!cr.expiresOn || cr.expiresOn >= today));
  const permitIssued = Boolean(permit && permit.status === "active" && permit.identifier && (!permit.expiresOn || permit.expiresOn >= today));
  const acts = Array.isArray(cr?.facts.activities) ? (cr!.facts.activities as { code?: unknown }[]).map((a) => String(a.code ?? "")).filter(Boolean) : [];
  const blockers: string[] = [];
  if (!registered) blockers.push("No current, unexpired commercial registration is on record.");
  if (!permitIssued) blockers.push("The commercial permit has not been issued or recorded.");
  return { registered, permitIssued, taxRegistered: Boolean(tax && tax.status === "active" && tax.identifier), registeredActivityCodes: acts, blockers };
}

// A service family is covered only if a registered activity code is listed for it here. Today only photography maps to the recorded
// activity (742010 — Photographic activities); every other service family is "not covered" and needs a deliberate decision. Nothing
// activates a service automatically.
export const ACTIVITY_COVERAGE: Record<string, string[]> = { photography: ["742010"] };
export function activityCoverage(serviceFamily: string, standing: Pick<EntityStanding, "registeredActivityCodes">): { covered: boolean; reason: string } {
  const need = ACTIVITY_COVERAGE[serviceFamily];
  if (!need) return { covered: false, reason: `“${serviceFamily}” is not covered by this entity's recorded registered activities; it needs a deliberate decision before it is offered.` };
  const ok = need.some((c) => standing.registeredActivityCodes.includes(c));
  return ok ? { covered: true, reason: "Covered by the entity's registered photographic activity." } : { covered: false, reason: "The entity's recorded registered activities do not include the activity this service needs." };
}

// ------------------------------------------------------------------ particulars for official documents
export type EntityParticulars = {
  legalName: string; legalForm: string | null; jurisdiction: string | null; crNumber: string | null; taxId: string | null; entityNumber: string | null;
  headOfficeCity: string | null; registeredAddress: string | null; permitLine: string | null; currency: string | null; registeredActivities: string[];
  statements: { mayStateRegistered: boolean; mayStatePermitIssued: boolean };
};

// The figures an official document (quotation, invoice, agreement) would print. It states registration only when a current registration
// exists, and a permit ONLY when one has been recorded — never "licensed" on the strength of a registration alone.
export function buildParticulars(input: {
  legalName: string; jurisdiction: string | null; currency: string | null; registrationType: string | null;
  sensitive: { registrationNumber: string | null; taxIdentifier: string | null; registeredAddress: string | null } | null;
  registrations: RegistrationFact[]; today: string;
}): EntityParticulars {
  const st = entityStanding(input.registrations, input.today);
  const cr = input.registrations.find((r) => r.kind === "commercial_registration" && r.status === "active");
  const permit = input.registrations.find((r) => r.kind === "commercial_permit" && r.status === "active");
  const f = (cr?.facts ?? {}) as Record<string, unknown>;
  const activities = Array.isArray(f.activities) ? (f.activities as { code?: string; name?: string }[]).map((a) => `${a.code ?? ""} — ${a.name ?? ""}`.trim()) : [];
  return {
    legalName: input.legalName,
    legalForm: input.registrationType,
    jurisdiction: input.jurisdiction,
    crNumber: st.registered ? (input.sensitive?.registrationNumber ?? cr?.identifier ?? null) : null,
    taxId: input.sensitive?.taxIdentifier ?? null,
    entityNumber: typeof f.entityNumber === "string" ? f.entityNumber : null,
    headOfficeCity: typeof f.headOfficeCity === "string" ? f.headOfficeCity : null,
    registeredAddress: input.sensitive?.registeredAddress ?? null,
    permitLine: st.permitIssued && permit ? `Commercial permit ${permit.identifier}${permit.expiresOn ? ` (valid to ${permit.expiresOn})` : ""}` : null,
    currency: input.currency,
    registeredActivities: activities,
    statements: { mayStateRegistered: st.registered, mayStatePermitIssued: st.permitIssued },
  };
}

// ------------------------------------------------------------------ receipts
export const money = (n: number) => Math.round(n * 100) / 100;
export type ReceiptLine = { code: string; description: string; amount: number };
export function reconcileReceipt(lines: ReceiptLine[], printedTotal: number): { ok: boolean; sum: number; difference: number; payable: ReceiptLine[] } {
  const payable = lines.filter((l) => money(l.amount) > 0); // zero-fee lines are printed on the receipt but are not expenses
  const sum = money(payable.reduce((s, l) => s + l.amount, 0));
  return { ok: sum === money(printedTotal), sum, difference: money(printedTotal - sum), payable };
}

// ------------------------------------------------------------------ which legal entity may contract
// The contracting entity is chosen EXPLICITLY for each booking, quotation or agreement. It is never derived from the client's location or
// currency. An entity is eligible only if its verified record supports it; a default is offered only when exactly one entity is eligible.
export type ContractingCandidate = {
  entityId: string; name: string; verified: boolean; active: boolean;
  registrations: RegistrationFact[];   // empty for an entity with no registry records (e.g. Ghana today)
};
export type Eligibility = { eligible: boolean; blockers: string[] };

export function assessContractingEligibility(c: ContractingCandidate, serviceFamily: string | null, today: string): Eligibility {
  const blockers: string[] = [];
  if (!c.active) blockers.push("The entity is not active.");
  if (!c.verified) blockers.push("The entity's registration has not been verified by a Super Admin.");
  if (c.registrations.length > 0) {
    const st = entityStanding(c.registrations, today);
    if (!st.registered) blockers.push("No current, unexpired commercial registration is on record.");
    // A permit is required once the entity is tracking one: a not-yet-issued permit means it may not contract.
    if (c.registrations.some((r) => r.kind === "commercial_permit") && !st.permitIssued) blockers.push("The commercial permit has not been issued or recorded.");
    if (serviceFamily) { const cov = activityCoverage(serviceFamily, st); if (!cov.covered) blockers.push(cov.reason); }
  }
  return { eligible: blockers.length === 0, blockers };
}

export function suggestContractingEntity(candidates: { entityId: string; eligibility: Eligibility }[]): { entityId: string; reason: string } | null {
  const ok = candidates.filter((c) => c.eligibility.eligible);
  return ok.length === 1 ? { entityId: ok[0].entityId, reason: "The only legal entity currently eligible to contract. Confirm it; it is not chosen automatically." } : null;
}
