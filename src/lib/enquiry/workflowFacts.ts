import { createAdminClient } from "@/lib/supabase/admin";
import { getContractingEntity } from "@/lib/organization/entityRegistrations";
import type { QuotationFact, WorkflowFacts } from "./workflowSummary";

// Loads the facts for the read-only workflow summary of one enquiry. Server-only. Reads only: nothing is written and nothing is inferred.
// The contracting entity is readable by a Super Admin only (the existing rule); for anyone else the summary leaves that line out.
export async function loadWorkflowFacts(enquiryId: string, viewer: { userId: string; isSuperAdmin: boolean }): Promise<WorkflowFacts | null> {
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("enquiries")
    .select("crm_stage, source_channel, received_at, submitted_at, created_by, commercial_intent, amount_due, amount_due_source, amount_paid, payment_status, payment_country, email_notifications_suppressed")
    .eq("id", enquiryId)
    .maybeSingle();
  if (!e) return null;
  const { data: q } = await admin
    .from("client_quotations")
    .select("quotation_reference, status, issued_at, accepted_at, accepted_via, acceptance_channel, accepted_by_name, currency, total, is_test")
    .eq("enquiry_id", enquiryId)
    .neq("status", "superseded")
    .order("created_at", { ascending: false });
  const quotations: QuotationFact[] = (q ?? []).map((r) => ({
    reference: r.quotation_reference,
    status: r.status,
    issuedAt: r.issued_at,
    acceptedAt: r.accepted_at,
    acceptedVia: r.accepted_via,
    acceptanceChannel: r.acceptance_channel,
    acceptedByName: r.accepted_by_name,
    currency: r.currency,
    total: Number(r.total ?? 0),
    isTest: Boolean(r.is_test),
  }));
  let contractingEntity: WorkflowFacts["contractingEntity"] = "hidden";
  if (viewer.isSuperAdmin) {
    const c = await getContractingEntity({ type: "enquiry", id: enquiryId }, viewer.userId);
    contractingEntity = c ? { name: c.entityName, version: c.version } : null;
  }
  return {
    stage: e.crm_stage,
    sourceChannel: e.source_channel,
    receivedAt: e.received_at,
    submittedAt: e.submitted_at,
    staffRecorded: e.created_by !== null,
    commercialIntent: e.commercial_intent,
    amountDue: e.amount_due == null ? null : Number(e.amount_due),
    amountDueSource: e.amount_due_source,
    amountPaid: e.amount_paid == null ? null : Number(e.amount_paid),
    paymentStatus: e.payment_status,
    paymentCountry: e.payment_country === "GH" || e.payment_country === "QA" ? e.payment_country : null,
    quotations,
    contractingEntity,
    emailsSuppressed: e.email_notifications_suppressed === true,
  };
}
