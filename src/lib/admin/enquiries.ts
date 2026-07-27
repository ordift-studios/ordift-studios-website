import { createClient } from "@/lib/supabase/server";
import type { PortalEnquiry } from "@/lib/portal/data";

export async function getEnquiryById(id: string): Promise<PortalEnquiry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(
      "id, reference_number, email, full_name, phone, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at"
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
