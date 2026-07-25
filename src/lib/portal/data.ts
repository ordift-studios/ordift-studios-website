import { createClient } from "@/lib/supabase/server";

// Uses the session-scoped Supabase client (anon key + RLS), not the
// admin client — "enquiries: read own" / "workshop_registrations: read
// own" policies already restrict these queries to auth.uid() = user_id,
// so there's no reason to bypass RLS just to read a user's own data.

export type PortalEnquiry = {
  id: string;
  referenceNumber: string;
  email: string;
  fullName: string;
  service: string;
  crmStage: string;
  paymentStatus: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  submittedAt: string;
};

export async function getEnquiriesForUser(userId: string): Promise<PortalEnquiry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(
      "id, reference_number, email, full_name, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at"
    )
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[portal] failed to load enquiries", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    referenceNumber: row.reference_number,
    email: row.email,
    fullName: row.full_name,
    service: row.service,
    crmStage: row.crm_stage,
    paymentStatus: row.payment_status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    submittedAt: row.submitted_at,
  }));
}

export type PortalWorkshopRegistration = {
  id: string;
  registrationReference: string;
  email: string;
  fullName: string;
  workshopSlug: string;
  workshopTitle: string;
  registrationStatus: string;
  waitingListPosition: number | null;
  paymentStatus: string;
  certificateIssued: boolean;
  certificateUrl: string | null;
  registrationDate: string;
};

export async function getWorkshopRegistrationsForUser(
  userId: string
): Promise<PortalWorkshopRegistration[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_registrations")
    .select(
      "id, registration_reference, email, full_name, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, certificate_issued, certificate_url, registration_date"
    )
    .eq("user_id", userId)
    .order("registration_date", { ascending: false });

  if (error) {
    console.error("[portal] failed to load workshop registrations", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    registrationReference: row.registration_reference,
    email: row.email,
    fullName: row.full_name,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title,
    registrationStatus: row.registration_status,
    waitingListPosition: row.waiting_list_position,
    paymentStatus: row.payment_status,
    certificateIssued: row.certificate_issued,
    certificateUrl: row.certificate_url,
    registrationDate: row.registration_date,
  }));
}

// Staff/admin operational views — no .eq("user_id", ...) filter, so the
// result set is exactly what the "read own or is_staff_or_admin()" RLS
// policy allows: a staff/admin session sees every row, anyone else sees
// only their own (safe default even if this were ever reached by a
// non-staff session). Capped at 100 — a full CRM list/search view is out
// of scope for this milestone (see MILESTONES.md V2.0).
const STAFF_VIEW_LIMIT = 100;

export async function getAllEnquiries(): Promise<PortalEnquiry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(
      "id, reference_number, email, full_name, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at"
    )
    .order("submitted_at", { ascending: false })
    .limit(STAFF_VIEW_LIMIT);

  if (error) {
    console.error("[portal] failed to load all enquiries", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    referenceNumber: row.reference_number,
    email: row.email,
    fullName: row.full_name,
    service: row.service,
    crmStage: row.crm_stage,
    paymentStatus: row.payment_status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    submittedAt: row.submitted_at,
  }));
}

export async function getAllWorkshopRegistrations(): Promise<PortalWorkshopRegistration[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_registrations")
    .select(
      "id, registration_reference, email, full_name, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, certificate_issued, certificate_url, registration_date"
    )
    .order("registration_date", { ascending: false })
    .limit(STAFF_VIEW_LIMIT);

  if (error) {
    console.error("[portal] failed to load all workshop registrations", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    registrationReference: row.registration_reference,
    email: row.email,
    fullName: row.full_name,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title,
    registrationStatus: row.registration_status,
    waitingListPosition: row.waiting_list_position,
    paymentStatus: row.payment_status,
    certificateIssued: row.certificate_issued,
    certificateUrl: row.certificate_url,
    registrationDate: row.registration_date,
  }));
}

const CRM_STAGE_LABELS: Record<string, string> = {
  new_lead: "New Enquiry",
  contacted: "Contacted",
  discovery_meeting: "Discovery Meeting",
  quotation_sent: "Quotation Sent",
  negotiation: "Negotiation",
  booked: "Booked",
  in_progress: "In Progress",
  delivered: "Delivered",
  completed: "Completed",
  repeat_client: "Repeat Client",
  referral: "Referral",
  declined: "Declined",
  closed: "Closed",
};

export function crmStageLabel(stage: string): string {
  return CRM_STAGE_LABELS[stage] ?? stage;
}
