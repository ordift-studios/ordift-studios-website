import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { issuanceBlockers, planIssuance } from "./quotationValidity";
import { DELIVERY_CHANNELS_UI } from "./quotationDeliveryChannels";
import { resolveQuotationEntity } from "./quotationEntity";

// ORDINARY quotation issuance, delivery record and their audit. Issuing is ONE deliberate, confirmed act that records WHEN it was issued, BY WHOM, and the approved validity.
// It is deliberately NOT sending: nothing is emailed or notified, and it creates no payment, booking, amount due, receivable or client acceptance. Delivering the quotation to the client
// is a separate step the person records afterwards. Crew Support quotations have their own issue path and are refused here.

export type IssueResult = { ok: true; issuedAt: string; validUntil: string; isException: boolean; isExtension: boolean } | { ok: false; error: string };

export async function issueOrdinaryQuotation(params: { quotationId: string; validUntil?: string | null; exceptionReason?: string | null }): Promise<IssueResult> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) return { ok: false, error: "Not authorized to issue quotations." };
  if (!params.quotationId) return { ok: false, error: "Quotation not found." };

  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, total, valid_until, issued_at, crew_support_request_id, quotation_reference").eq("id", params.quotationId).maybeSingle();
  if (!q) return { ok: false, error: "Quotation not found." };
  const { count } = await admin.from("client_quotation_items").select("id", { count: "exact", head: true }).eq("quotation_id", params.quotationId);
  const blockers = issuanceBlockers({ status: q.status, lineCount: count ?? 0, total: Number(q.total ?? 0), crewManaged: Boolean(q.crew_support_request_id) });
  if (blockers.length) return { ok: false, error: blockers.join(" ") };

  // FAIL CLOSED: a quotation is issued only with a contracting legal entity that was explicitly recorded (on it or on its enquiry) and that can currently contract. Read from the
  // authoritative record at this moment, never inferred or defaulted. A draft needs none; issuing does.
  const entity = await resolveQuotationEntity(params.quotationId);
  if (!entity.ok) return { ok: false, error: entity.message };

  const now = new Date();
  const plan = planIssuance({ now, existingValidUntil: q.valid_until, requestedValidUntil: params.validUntil ?? null, exceptionReason: params.exceptionReason ?? null, isSuperAdmin: isSuperAdmin(user) });
  if (!plan.ok) return plan;

  // One conditional write: only a still-draft, never-issued row can be issued, so two people pressing at once (or a double tap) produce exactly one issuance.
  const issuedAt = now.toISOString();
  const { data: updated, error } = await admin.from("client_quotations")
    .update({ status: "sent", issued_at: issuedAt, issued_by: user.id, valid_until: plan.validUntil })
    .eq("id", params.quotationId).eq("status", "draft").is("issued_at", null)
    .select("id").maybeSingle();
  if (error) { console.error("[commercial] failed to issue quotation", error.message); return { ok: false, error: "The quotation could not be issued. Nothing was changed." }; }
  if (!updated) return { ok: false, error: "This quotation was already issued or changed by someone else. Reload to see its current state. Nothing was changed." };

  await logActivity({
    actorUserId: user.id, action: "client_quotation.issued", entityType: "client_quotation", entityId: params.quotationId,
    metadata: {
      quotationReference: q.quotation_reference, from: "draft", issuedAt, validUntil: plan.validUntil, standardValidUntil: plan.defaultUntil, withinStandardPolicy: !plan.isException,
      ...(plan.isException ? { exceptionReason: (params.exceptionReason ?? "").trim(), extensionBeyondStandard: plan.isExtension, approvedBy: user.id } : {}),
      ...(plan.replacedExpired ? { replacedExpiredCarriedDate: q.valid_until } : {}),
      contractingEntity: { entityId: entity.entity.entityId, name: entity.entity.name, recordedOn: entity.entity.source, version: entity.entity.version },
      delivery: "not sent by the system: issuing does not email or notify the client",
    },
  });
  return { ok: true, issuedAt, validUntil: plan.validUntil, isException: plan.isException, isExtension: plan.isExtension };
}

// ---- delivery to the client: a person records HOW and WHEN they delivered it. Kept as an audit event (no schema change); it never changes the quotation.
export const DELIVERY_CHANNELS = DELIVERY_CHANNELS_UI;

export async function recordQuotationDelivery(params: { quotationId: string; channel: string; deliveredAt: string; note?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) return { ok: false, error: "Not authorized to manage quotations." };
  if (!DELIVERY_CHANNELS.some((c) => c.value === params.channel)) return { ok: false, error: "Choose how it was delivered." };
  const when = new Date(params.deliveredAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Enter when it was delivered." };
  if (when.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "The delivery time cannot be in the future." };
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, issued_at, quotation_reference, crew_support_request_id").eq("id", params.quotationId).maybeSingle();
  if (!q) return { ok: false, error: "Quotation not found." };
  if (q.crew_support_request_id) return { ok: false, error: "Crew Support quotations are delivered from their Crew Support request." };
  if (q.status !== "sent" && q.status !== "accepted") return { ok: false, error: "Only an issued quotation can have a delivery recorded. Issue it first." };
  if (q.issued_at && when.getTime() < new Date(q.issued_at).getTime() - 60_000) return { ok: false, error: "It cannot have been delivered before it was issued." };
  await logActivity({
    actorUserId: user.id, action: "client_quotation.delivery_recorded", entityType: "client_quotation", entityId: params.quotationId,
    metadata: { quotationReference: q.quotation_reference, channel: params.channel, deliveredAt: when.toISOString(), note: (params.note ?? "").trim().slice(0, 300) || null, recordedBy: user.id, note_system: "recorded by staff; the system did not send anything" },
  });
  return { ok: true };
}

export type DeliveryFact = { channel: string; deliveredAt: string; recordedAt: string } | null;
export async function getQuotationDelivery(quotationId: string): Promise<DeliveryFact> {
  const { data } = await createAdminClient().from("activity_log").select("created_at, metadata").eq("entity_id", quotationId).eq("action", "client_quotation.delivery_recorded").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const m = (data?.metadata ?? null) as { channel?: string; deliveredAt?: string } | null;
  return data && m?.channel && m.deliveredAt ? { channel: m.channel, deliveredAt: m.deliveredAt, recordedAt: data.created_at as string } : null;
}
