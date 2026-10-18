// Client Directory — what the directory shows about the records linked to a contact or organisation, and the checks made before a link is set. Pure.
//
// The directory is deliberately ENTITY-NEUTRAL: it belongs to the platform business (businesses.id), not to the Ghana or Qatar legal entity, because
// one client may transact with both. The legal entity that contracts, and the payment market, stay on each enquiry / quotation (the existing
// booking_contracting_entities record, chosen explicitly by a Super Admin and never inferred, and enquiries.payment_country). Linking a record to a
// contact or organisation never sets, changes or infers either. This module only SHOWS the entities and markets involved and warns when they differ.

export type LinkedRecord = {
  type: "enquiry" | "quotation";
  id: string;
  label: string; // reference number or quotation reference
  entityName: string | null; // contracting entity, null when none has been chosen yet
  paymentCountry: "GH" | "QA" | null;
  isTest: boolean;
};

export type TransactionContext = {
  entities: string[];
  markets: ("GH" | "QA")[];
  withoutEntity: number;
  warnings: string[];
};

const MARKET_LABEL: Record<"GH" | "QA", string> = { GH: "Ghana", QA: "Qatar" };

export function summariseTransactions(records: LinkedRecord[]): TransactionContext {
  const live = records.filter((r) => !r.isTest);
  const entities = [...new Set(live.map((r) => r.entityName).filter((n): n is string => Boolean(n)))].sort();
  const markets = [...new Set(live.map((r) => r.paymentCountry).filter((m): m is "GH" | "QA" => m === "GH" || m === "QA"))].sort();
  const withoutEntity = live.filter((r) => !r.entityName).length;
  const warnings: string[] = [];
  if (entities.length > 1) warnings.push(`Linked records are contracted under different legal entities (${entities.join(" and ")}). Check each one is attached to the right entity.`);
  if (markets.length > 1) warnings.push(`Linked records use different payment markets (${markets.map((m) => MARKET_LABEL[m]).join(" and ")}). Check each one is correct.`);
  return { entities, markets, withoutEntity, warnings };
}

export type LinkTarget = { contactId: string | null; organisationId: string | null };
export type LinkPlan = { ok: true; changes: boolean; notes: string[] } | { ok: false; error: string };

// Linking an enquiry or quotation. At least one target is required (clearing a link is a separate, explicit action). A contact whose employer differs
// from the organisation being linked is allowed (an event planner enquiring for a hotel) and noted rather than blocked.
export function planLink(current: LinkTarget, next: LinkTarget, contactOrganisationId: string | null): LinkPlan {
  if (!next.contactId && !next.organisationId) return { ok: false, error: "Choose a contact or an organisation to link." };
  const changes = (current.contactId ?? null) !== (next.contactId ?? null) || (current.organisationId ?? null) !== (next.organisationId ?? null);
  const notes: string[] = [];
  if (next.contactId && next.organisationId && contactOrganisationId && contactOrganisationId !== next.organisationId) {
    notes.push("The contact works for a different organisation from the client organisation linked here (for example a planner enquiring for a hotel).");
  }
  return { ok: true, changes, notes };
}
