import { createAdminClient } from "@/lib/supabase/admin";

// Enquiry-to-booking M2a (decision 1): the contracting legal entity must be chosen EXPLICITLY, by a Super Admin, before an acceptance is recorded for an
// enquiry-linked ordinary quotation, and before an amount due is established. It is never inferred from currency, location or nationality: this file only
// asks whether a choice has been RECORDED (on the quotation or on its enquiry); choosing is done on the existing contracting-entity screen.
export async function hasContractingEntityRecorded(p: { quotationId?: string | null; enquiryId?: string | null }): Promise<boolean> {
  const db = createAdminClient();
  const checks: PromiseLike<{ data: { id: string }[] | null }>[] = [];
  if (p.quotationId) checks.push(db.from("booking_contracting_entities").select("id").eq("subject_type", "quotation").eq("subject_id", p.quotationId).limit(1));
  if (p.enquiryId) checks.push(db.from("booking_contracting_entities").select("id").eq("subject_type", "enquiry").eq("subject_id", p.enquiryId).limit(1));
  const results = await Promise.all(checks);
  return results.some((r) => (r.data ?? []).length > 0);
}

export const CONTRACTING_ENTITY_REQUIRED_MESSAGE =
  "Choose the contracting entity first. A Super Admin records it explicitly on the quotation or enquiry page (it is never inferred), and only then can the acceptance be recorded.";
