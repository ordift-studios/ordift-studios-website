import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { validateStaffAcceptance } from "@/lib/crewSupport/quotationRules";

// Recorded client acceptance of an ORDINARY (non-Crew-Support) quotation, with its evidence. Server-only.
//
// "Accepted" used to be a bare status flip with no record of who accepted, how or when. It now carries the same evidence the Crew Support workflow already
// requires and the database already enforces for a staff-recorded acceptance (channel, evidence, who accepted, when it was received, who recorded it).
//
// What this does, and does not do:
//   * It records that the client said yes. That is NOT a booking, and the booking stage keeps its existing meaning.
//   * It does NOT set or change the enquiry's amount due, create a payment, obligation, receivable or invoice, change any stage, or send any email.
//   * It does not touch Crew Support quotations: those are managed only from their Crew Support request.

type Result = { ok: true } | { ok: false; error: string };

export async function recordOrdinaryQuotationAcceptance(params: {
  quotationId: string;
  channel: string;
  evidence: string;
  acceptedByName: string;
  receivedAt: string;
}): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) return { ok: false, error: "Not authorized to manage quotations." };

  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, crew_support_request_id, issued_at").eq("id", params.quotationId).maybeSingle();
  if (!q) return { ok: false, error: "Quotation not found." };
  if (q.crew_support_request_id) return { ok: false, error: "This quotation belongs to a Crew Support request — record the acceptance from that request." };
  if (q.status !== "sent") return { ok: false, error: q.status === "accepted" ? "This quotation's acceptance is already recorded." : "Only an issued (sent) quotation can have an acceptance recorded." };

  const checked = validateStaffAcceptance({ channel: params.channel, evidence: params.evidence, acceptedByName: params.acceptedByName, receivedAt: params.receivedAt, now: new Date(), issuedAt: q.issued_at });
  if (!checked.ok) return { ok: false, error: checked.reason };

  const { data: updated, error } = await admin
    .from("client_quotations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_via: "staff_recorded",
      accepted_by_name: params.acceptedByName.trim(),
      acceptance_channel: params.channel,
      acceptance_evidence: params.evidence.trim(),
      acceptance_received_at: checked.receivedAtIso,
      acceptance_recorded_by: user.id,
    })
    .eq("id", params.quotationId)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    console.error("[commercial] failed to record quotation acceptance", error?.message);
    return { ok: false, error: "Could not record the acceptance. It may have changed; reload and check." };
  }

  await logActivity({
    actorUserId: user.id,
    action: "client_quotation.acceptance_recorded",
    entityType: "client_quotation",
    entityId: params.quotationId,
    metadata: { via: "staff_recorded", channel: params.channel, receivedAt: checked.receivedAtIso },
  });
  return { ok: true };
}

export type QuotationAcceptanceRecord = { acceptedAt: string; via: string | null; channel: string | null; byName: string | null; evidence: string | null; receivedAt: string | null };

// Read-only: the recorded acceptance of a quotation, for the quotation page. Admin-only (the page enforces it).
export async function getQuotationAcceptanceRecord(quotationId: string): Promise<QuotationAcceptanceRecord | null> {
  const { data } = await createAdminClient()
    .from("client_quotations")
    .select("accepted_at, accepted_via, acceptance_channel, accepted_by_name, acceptance_evidence, acceptance_received_at")
    .eq("id", quotationId)
    .eq("status", "accepted")
    .maybeSingle();
  if (!data?.accepted_at) return null;
  return { acceptedAt: data.accepted_at, via: data.accepted_via, channel: data.acceptance_channel, byName: data.accepted_by_name, evidence: data.acceptance_evidence, receivedAt: data.acceptance_received_at };
}
