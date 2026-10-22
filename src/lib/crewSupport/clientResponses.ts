import { createAdminClient } from "@/lib/supabase/admin";
import { batchHash, DELIVERY_ACTIONS, RATING_ACTION } from "@/lib/portal/clientDelivery";
import {
  BULK_DOWNLOAD_ACTION,
  NOTIFICATION_ACTION,
  buildClientResponsesView,
  buildClosureSummary,
  type ClientResponsesView,
  type ClosureRow,
  type RawEvent,
} from "./clientResponsesView";

// Read-only loaders for the Crew Support request screen and the assigned professional's workspace. They read the existing
// audited client records and current state; they write nothing. Callers enforce who may see the result (see below).

const SLOT_ENTITY = "crew_support_slot";

async function engagementForRequest(requestId: string): Promise<{ id: string; status: string; payeeProfileId: string | null; paymentObligationId: string | null } | null> {
  const admin = createAdminClient();
  const { data: slots } = await admin.from("crew_support_slots").select("id, status").eq("request_id", requestId);
  const ids = (slots ?? []).filter((s) => s.status === "assigned").map((s) => s.id as string);
  if (ids.length === 0) return null;
  const { data } = await admin.from("engagements").select("id, status, payee_profile_id, payment_obligation_id").eq("entity_type", SLOT_ENTITY).in("entity_id", ids).limit(1).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, status: data.status as string, payeeProfileId: (data.payee_profile_id as string | null) ?? null, paymentObligationId: (data.payment_obligation_id as string | null) ?? null };
}

async function loadEvents(enquiryId: string): Promise<RawEvent[]> {
  const { data } = await createAdminClient()
    .from("activity_log")
    .select("action, created_at, metadata")
    .eq("entity_id", enquiryId)
    .in("action", [...Object.values(DELIVERY_ACTIONS), RATING_ACTION, NOTIFICATION_ACTION, BULK_DOWNLOAD_ACTION])
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({ at: r.created_at as string, action: r.action as string, metadata: (r.metadata ?? null) as Record<string, unknown> | null }));
}

export type AdminClientResponses = {
  reference: string;
  view: ClientResponsesView;
  closure: ClosureRow[];
  acceptedButNotCompleted: boolean;
  professionalName: string | null;
  engagementId: string | null;
};

// For the Crew Support request screen. The caller has ALREADY been authorised to open this request (canManageCrewSupport) -
// this adds no new access, and returns only the client's responses, never private evaluations or restricted notes.
export async function loadClientResponsesForRequest(requestId: string): Promise<AdminClientResponses | null> {
  const admin = createAdminClient();
  const { data: request } = await admin.from("crew_support_requests").select("id, enquiry_id, reference_number, status").eq("id", requestId).maybeSingle();
  if (!request) return null;
  const enquiryId = request.enquiry_id as string;
  const engagement = await engagementForRequest(requestId);

  let released: { id: string; retain: boolean; file_kind: string; deliverable_id: string | null }[] = [];
  let finalApproved = 0;
  if (engagement) {
    const { data: files } = await admin.from("project_files").select("id, release_status, retain, file_kind, purged_at, deliverable_id").eq("engagement_id", engagement.id);
    released = (files ?? []).filter((f) => f.release_status === "released" && !f.purged_at).map((f) => ({ id: f.id as string, retain: Boolean(f.retain), file_kind: f.file_kind as string, deliverable_id: (f.deliverable_id as string | null) ?? null }));
    finalApproved = (files ?? []).filter((f) => f.file_kind === "final_approved" && !f.purged_at).length;
  }
  const currentBatch = released.length > 0 ? batchHash(released.filter((f) => f.deliverable_id).map((f) => f.id)) : null;
  const events = await loadEvents(enquiryId);
  const view = buildClientResponsesView(events, currentBatch);

  let payable: { status: string; amount: string; currency: string; paid: boolean } | null = null;
  if (engagement?.paymentObligationId) {
    const { data: po } = await admin.from("payment_obligations").select("status, amount, currency, paid_at").eq("id", engagement.paymentObligationId).maybeSingle();
    if (po) payable = { status: po.status as string, amount: String(po.amount), currency: po.currency as string, paid: Boolean(po.paid_at) };
  }

  let pending: number | null = null;
  const { data: reqs, error: reqErr } = await admin.from("project_requests").select("status").eq("entity_type", "enquiry").eq("entity_id", enquiryId);
  if (!reqErr) pending = (reqs ?? []).filter((r) => r.status === "pending").length;

  const closure = buildClosureSummary(view, {
    releasedCount: released.length,
    protectedCount: released.filter((f) => f.retain || f.file_kind === "final_approved").length,
    finalApprovedCount: finalApproved,
    engagementStatus: engagement?.status ?? null,
    requestStatus: request.status as string,
    payable,
    pendingCorrectionRequests: pending,
  });

  let professionalName: string | null = null;
  const proId = view.rating?.professionalProfileId ?? engagement?.payeeProfileId ?? null;
  if (proId) {
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", proId).maybeSingle();
    professionalName = (p?.full_name as string | null) ?? null;
  }
  return { reference: request.reference_number as string, view, closure: closure.rows, acceptedButNotCompleted: closure.acceptedButNotCompleted, professionalName, engagementId: engagement?.id ?? null };
}

export type ProfessionalFeedback = {
  reference: string;
  receiptAt: string | null;
  acceptedAt: string | null;
  correctionRequests: number;
  rating: { at: string; overall: number | null; categories: { label: string; value: number }[]; comment: string | null } | null;
};

// For the ASSIGNED PROFESSIONAL only: feedback about their own assignment. Authorised by the engagement itself (the caller must
// be its payee/assigned professional); it contains the client's responses only - no notification status, closure state,
// payables, internal evaluations or administrative notes.
export async function loadClientFeedbackForProfessional(engagementId: string, userId: string): Promise<ProfessionalFeedback | null> {
  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("id, entity_type, entity_id, payee_profile_id").eq("id", engagementId).maybeSingle();
  if (!eng || eng.entity_type !== SLOT_ENTITY || eng.payee_profile_id !== userId) return null;
  const { data: slot } = await admin.from("crew_support_slots").select("request_id").eq("id", eng.entity_id as string).maybeSingle();
  if (!slot) return null;
  const { data: request } = await admin.from("crew_support_requests").select("enquiry_id, reference_number").eq("id", slot.request_id as string).maybeSingle();
  if (!request) return null;
  const view = buildClientResponsesView(await loadEvents(request.enquiry_id as string), null);
  if (!view.hasAnyResponse) return null;
  const r = view.rating;
  const labels: Record<string, string> = { quality: "Photography quality", professionalism: "Professionalism", communication: "Communication", punctuality: "Punctuality" };
  return {
    reference: request.reference_number as string,
    receiptAt: view.receipt?.at ?? null,
    acceptedAt: view.accepted?.at ?? null,
    correctionRequests: view.corrections.length,
    rating: r
      ? {
          at: r.at,
          overall: r.ratings.overall ?? null,
          categories: Object.entries(labels).filter(([k]) => r.ratings[k as keyof typeof r.ratings] !== undefined).map(([k, label]) => ({ label, value: r.ratings[k as keyof typeof r.ratings] as number })),
          comment: r.comment,
        }
      : null,
  };
}
