import { createClient } from "@/lib/supabase/server";
import type { PortalEnquiry } from "@/lib/portal/data";

export async function getEnquiryById(id: string): Promise<PortalEnquiry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(
      "id, reference_number, email, full_name, phone, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at, is_test"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin] failed to load enquiry", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    referenceNumber: data.reference_number,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    service: data.service,
    crmStage: data.crm_stage,
    paymentStatus: data.payment_status,
    amountDue: data.amount_due,
    amountPaid: data.amount_paid,
    submittedAt: data.submitted_at,
    isTest: data.is_test,
  };
}

export type NoteAudience = "internal" | "client";

export type EnquiryNote = {
  id: string;
  authorName: string | null;
  note: string;
  audience: NoteAudience;
  createdAt: string;
};

export async function getEnquiryNotes(enquiryId: string): Promise<EnquiryNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiry_notes")
    .select("id, note, audience, created_at, profiles(full_name)")
    .eq("enquiry_id", enquiryId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin] failed to load enquiry_notes", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    authorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    note: row.note,
    audience: row.audience as NoteAudience,
    createdAt: row.created_at,
  }));
}

// CRM stages in pipeline order, for the stage-change dropdown — mirrors
// public.crm_stage (supabase/migrations/0001_init.sql).
export const CRM_STAGES = [
  "new_lead",
  "contacted",
  "discovery_meeting",
  "quotation_sent",
  "negotiation",
  "booked",
  "in_progress",
  "delivered",
  "completed",
  "repeat_client",
  "referral",
  "declined",
  "closed",
] as const;

export type CrmStage = (typeof CRM_STAGES)[number];

// Where the enquiry's amount_due came from (0144). A missing/errored read
// degrades to "legacy" — it must never break the enquiry page.
export type AmountDueProvenance =
  | { kind: "accepted_quotation"; quotationId: string; quotationReference: string | null }
  | { kind: "manual" }
  | { kind: "other" }
  | { kind: "legacy" };

export async function getAmountDueProvenance(enquiryId: string): Promise<AmountDueProvenance> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("enquiries").select("amount_due_source, amount_due_quotation_id").eq("id", enquiryId).maybeSingle();
  if (error || !data?.amount_due_source) return { kind: "legacy" };
  if (data.amount_due_source === "accepted_quotation" && data.amount_due_quotation_id) {
    const { data: q } = await supabase.from("client_quotations").select("quotation_reference").eq("id", data.amount_due_quotation_id).maybeSingle();
    return { kind: "accepted_quotation", quotationId: data.amount_due_quotation_id as string, quotationReference: (q?.quotation_reference as string | null) ?? null };
  }
  return data.amount_due_source === "manual" ? { kind: "manual" } : { kind: "other" };
}

export function describeAmountDueProvenance(p: AmountDueProvenance): string {
  switch (p.kind) {
    case "accepted_quotation":
      return `Accepted quotation ${p.quotationReference ?? ""}`.trim();
    case "manual":
      return "Entered manually by staff";
    case "other":
      return "Other recorded source";
    default:
      return "Not recorded (set before source tracking)";
  }
}
