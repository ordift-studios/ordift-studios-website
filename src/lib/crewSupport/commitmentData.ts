import { createAdminClient } from "@/lib/supabase/admin";
import type { SlotStatus } from "./config";
import { loadConflicts, firmConflicts } from "./conflicts";
import { assessAgreement, confirmationBlockers, describeContractBasis, type AgreementAssessment, type ContractBasisView, type AgreementFacts, type SlotCommitment } from "./commitmentRules";
import type { StatusChangeContext } from "./rules";

// Server-only loaders for the commitment layer. Read-only. Callers must
// have checked canManageCrewSupport().

const EXECUTED_AGREEMENT_STATUSES = ["fully_executed", "active", "completed"]; // mirrors isFullyExecuted() in legal/agreementLifecycle.ts

export type CommitmentSnapshot = {
  requestId: string;
  reference: string;
  status: string;
  isTest: boolean;
  startDate: string;
  endDate: string;
  agreementRequired: boolean;
  agreementReason: string | null;
  agreement: AgreementFacts;
  agreementAssessment: AgreementAssessment;
  contractBasis: ContractBasisView;
  hasAcceptedQuotation: boolean;
  slots: (SlotCommitment & { slotId: string; requirementId: string; roleLabel: string; slotNumber: number; crewAcceptedAt: string | null; assigneeName: string | null })[];
  blockers: string[];
};

export async function getCommitmentSnapshot(requestId: string): Promise<CommitmentSnapshot | null> {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("crew_support_requests")
    .select("id, reference_number, status, is_test, start_date, end_date, agreement_required, agreement_required_reason")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return null;

  const [{ data: quotes }, { data: executed }, { data: slotRows }, { data: requirements }] = await Promise.all([
    admin.from("client_quotations").select("status, payment_booking_terms").eq("crew_support_request_id", requestId).in("status", ["draft", "ready", "sent", "accepted"]),
    admin.from("agreements").select("id").eq("primary_context_type", "crew_support_request").eq("primary_context_reference", request.reference_number).in("status", EXECUTED_AGREEMENT_STATUSES).limit(1),
    admin.from("crew_support_slots").select("id, requirement_id, slot_number, status, assignee_profile_id, crew_accepted_at").eq("request_id", requestId).order("slot_number"),
    admin.from("crew_support_requirements").select("id, role_label").eq("request_id", requestId),
  ]);

  const accepted = (quotes ?? []).find((q) => q.status === "accepted");
  const agreement: AgreementFacts = {
    required: Boolean(request.agreement_required),
    reason: (request.agreement_required_reason as string | null) ?? null,
    hasExecutedAgreement: (executed ?? []).length > 0,
    quotationTerms: (accepted?.payment_booking_terms as string | null) ?? null,
  };
  const agreementAssessment = assessAgreement(agreement);
  // For DISPLAY, judge the terms on the quotation the client sees: the
  // accepted one, else the live issued/ready/draft one.
  const live = accepted ?? (quotes ?? []).find((q) => q.status === "sent") ?? (quotes ?? []).find((q) => q.status === "ready") ?? (quotes ?? [])[0];
  const contractBasis = describeContractBasis({
    required: agreement.required,
    reason: agreement.reason,
    hasExecutedAgreement: agreement.hasExecutedAgreement,
    quotation: accepted ? "accepted" : live ? "pending" : "none",
    quotationTerms: (live?.payment_booking_terms as string | null) ?? null,
  });

  const assigneeIds = [...new Set((slotRows ?? []).map((s) => s.assignee_profile_id as string | null).filter((p): p is string => Boolean(p)))];
  const slotIds = (slotRows ?? []).map((s) => s.id as string);
  const names = new Map<string, string>();
  const conflictsByPerson = assigneeIds.length ? await loadConflicts(assigneeIds, { start: request.start_date as string, end: request.end_date as string }, requestId, Boolean(request.is_test)) : new Map();
  if (assigneeIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", assigneeIds);
    for (const p of profiles ?? []) names.set(p.id as string, (p.full_name as string | null) ?? "Unnamed profile");
  }
  const engagements = new Map<string, { id: string; agreedAmount: number | null; currency: string | null; status: string }>();
  if (slotIds.length) {
    const { data: eng } = await admin.from("engagements").select("id, entity_id, agreed_amount, currency, status").eq("entity_type", "crew_support_slot").in("entity_id", slotIds).neq("status", "cancelled");
    for (const e of eng ?? []) engagements.set(e.entity_id as string, { id: e.id as string, agreedAmount: e.agreed_amount == null ? null : Number(e.agreed_amount), currency: (e.currency as string | null) ?? null, status: e.status as string });
  }
  const roleById = new Map((requirements ?? []).map((r) => [r.id as string, r.role_label as string]));

  const slots = (slotRows ?? []).map((s) => {
    const assignee = (s.assignee_profile_id as string | null) ?? null;
    const roleLabel = roleById.get(s.requirement_id as string) ?? "Crew";
    const assigneeName = assignee ? names.get(assignee) ?? null : null;
    return {
      slotId: s.id as string,
      requirementId: s.requirement_id as string,
      roleLabel,
      slotNumber: s.slot_number as number,
      label: `${roleLabel} ${s.slot_number}${assigneeName ? ` — ${assigneeName}` : ""}`,
      status: s.status as SlotStatus,
      assigneeProfileId: assignee,
      assigneeName,
      crewAccepted: Boolean(s.crew_accepted_at),
      crewAcceptedAt: (s.crew_accepted_at as string | null) ?? null,
      engagement: engagements.get(s.id as string) ?? null,
      firmConflicts: assignee ? firmConflicts(conflictsByPerson.get(assignee) ?? []).map((c: { label: string }) => c.label) : [],
    };
  });

  const hasAcceptedQuotation = Boolean(accepted);
  return {
    requestId,
    reference: request.reference_number as string,
    status: request.status as string,
    isTest: Boolean(request.is_test),
    startDate: request.start_date as string,
    endDate: request.end_date as string,
    agreementRequired: agreement.required,
    agreementReason: agreement.reason,
    agreement,
    agreementAssessment,
    contractBasis,
    hasAcceptedQuotation,
    slots,
    blockers: confirmationBlockers({ hasAcceptedQuotation, agreement: agreementAssessment, slots, isTest: Boolean(request.is_test) }),
  };
}

// Everything validateStatusChange needs, from real data.
export async function getStatusContext(requestId: string): Promise<StatusChangeContext> {
  const { data } = await createAdminClient().from("client_quotations").select("status").eq("crew_support_request_id", requestId).in("status", ["draft", "ready", "sent", "accepted"]);
  const statuses = (data ?? []).map((q) => q.status as string);
  const snapshot = await getCommitmentSnapshot(requestId);
  return {
    hasLiveQuotation: statuses.length > 0,
    hasIssuedQuotation: statuses.some((x) => x === "sent" || x === "accepted"),
    hasAcceptedQuotation: statuses.includes("accepted"),
    agreementRequired: snapshot?.agreementRequired ?? false,
    agreementSatisfied: snapshot?.agreementAssessment.satisfied ?? false,
    confirmationBlockers: snapshot?.blockers ?? [],
  };
}
