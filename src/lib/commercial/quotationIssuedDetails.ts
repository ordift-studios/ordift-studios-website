import { createAdminClient } from "@/lib/supabase/admin";

// The legal identity of the contracting entity AS IT WAS WHEN THE QUOTATION WAS ISSUED. It is captured once, inside the issuance audit event (`client_quotation.issued`), which the
// platform already treats as its append-only evidence store (delivery and acceptance are kept the same way, so no schema change is needed). An issued quotation's preview / PDF
// reads ONLY this snapshot: later changes to the live entity registry (a renewed registration, a new tax number, an entity that stops being eligible) never alter a document that
// was already issued. Nothing is reconstructed or guessed: an issued quotation with no snapshot shows no entity block rather than live data.
//
// The AUTHORITATIVE issuance record is the `client_quotation.issued` event whose recorded issue time and issuer equal the quotation row's own `issued_at` / `issued_by` (the row is
// written by the single conditional update that issues it). Any other `issued` event for the same quotation, for example from an issuance that was rolled back, is ignored.

export const ISSUED_ACTION = "client_quotation.issued";

export type IssuedLegalDetails = {
  entityId: string; name: string; recordedOn: "quotation" | "enquiry"; version: number;
  legalName: string; registrationType: string | null; identifiers: { label: string; identifier: string }[]; capturedAt: string;
};

export function parseIssuedLegalDetails(metadata: unknown): IssuedLegalDetails | null {
  const d = (metadata as { legalDetails?: Record<string, unknown> } | null)?.legalDetails;
  if (!d || typeof d !== "object") return null;
  if (typeof d.entityId !== "string" || typeof d.name !== "string" || typeof d.legalName !== "string" || !d.legalName.trim()) return null;
  if (d.recordedOn !== "quotation" && d.recordedOn !== "enquiry") return null;
  const ids = Array.isArray(d.identifiers) ? d.identifiers : [];
  const identifiers = ids.flatMap((i) => (i && typeof (i as { label?: unknown }).label === "string" && typeof (i as { identifier?: unknown }).identifier === "string" ? [{ label: (i as { label: string }).label, identifier: (i as { identifier: string }).identifier }] : []));
  return {
    entityId: d.entityId, name: d.name, recordedOn: d.recordedOn, version: Number(d.version ?? 0), legalName: d.legalName,
    registrationType: typeof d.registrationType === "string" && d.registrationType.trim() ? d.registrationType : null, identifiers,
    capturedAt: typeof d.capturedAt === "string" ? d.capturedAt : "",
  };
}

export type IssuanceEventRow = { id: string; created_at: string; actor_user_id: string | null; metadata: unknown };

// Pure: the one event that IS this quotation's issuance (matched on the row's own issue time and issuer). The earliest match wins if there were ever two.
export function pickIssuanceEvent(events: IssuanceEventRow[], issuedAt: string, issuedBy: string | null): IssuanceEventRow | null {
  const at = new Date(issuedAt).getTime();
  if (Number.isNaN(at)) return null;
  const matches = events.filter((e) => {
    const m = e.metadata as { issuedAt?: string } | null;
    const t = m?.issuedAt ? new Date(m.issuedAt).getTime() : NaN;
    return t === at && (issuedBy === null || e.actor_user_id === issuedBy);
  });
  return matches.sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
}

export type IssuedLegalDetailsResult =
  | { state: "not_issued" }
  | { state: "no_snapshot" }                                                 // issued before the snapshot existed (or its record is missing): show no entity block
  | { state: "ok"; details: IssuedLegalDetails; record: { eventId: string; recordedAt: string; issuedAt: string } };

export async function readIssuedLegalDetails(quotationId: string): Promise<IssuedLegalDetailsResult> {
  const db = createAdminClient();
  const { data: q } = await db.from("client_quotations").select("issued_at, issued_by, crew_support_request_id").eq("id", quotationId).maybeSingle();
  if (!q || q.crew_support_request_id || !q.issued_at) return { state: "not_issued" };
  const { data: events } = await db.from("activity_log").select("id, created_at, actor_user_id, metadata").eq("entity_id", quotationId).eq("action", ISSUED_ACTION);
  const hit = pickIssuanceEvent((events ?? []) as IssuanceEventRow[], q.issued_at as string, (q.issued_by as string | null) ?? null);
  const details = hit ? parseIssuedLegalDetails(hit.metadata) : null;
  if (!hit || !details) return { state: "no_snapshot" };
  return { state: "ok", details, record: { eventId: hit.id, recordedAt: hit.created_at, issuedAt: q.issued_at as string } };
}
