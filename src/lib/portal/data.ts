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
  phone: string | null;
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
      "id, reference_number, email, full_name, phone, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at"
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
    phone: row.phone,
    service: row.service,
    crmStage: row.crm_stage,
    paymentStatus: row.payment_status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    submittedAt: row.submitted_at,
  }));
}

export async function getEnquiryByIdForUser(id: string, userId: string): Promise<PortalEnquiry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(
      "id, reference_number, email, full_name, phone, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

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

export type PortalWorkshopRegistration = {
  id: string;
  registrationReference: string;
  email: string;
  fullName: string;
  phone: string | null;
  workshopSlug: string;
  workshopTitle: string;
  registrationStatus: string;
  waitingListPosition: number | null;
  paymentStatus: string;
  amountDue: number | null;
  amountPaid: number | null;
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
      "id, registration_reference, email, full_name, phone, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, amount_due, amount_paid, certificate_issued, certificate_url, registration_date"
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
    phone: row.phone,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title,
    registrationStatus: row.registration_status,
    waitingListPosition: row.waiting_list_position,
    paymentStatus: row.payment_status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    certificateIssued: row.certificate_issued,
    certificateUrl: row.certificate_url,
    registrationDate: row.registration_date,
  }));
}

export async function getWorkshopRegistrationByIdForUser(
  id: string,
  userId: string
): Promise<PortalWorkshopRegistration | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_registrations")
    .select(
      "id, registration_reference, email, full_name, phone, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, amount_due, amount_paid, certificate_issued, certificate_url, registration_date"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    registrationReference: data.registration_reference,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    workshopSlug: data.workshop_slug,
    workshopTitle: data.workshop_title,
    registrationStatus: data.registration_status,
    waitingListPosition: data.waiting_list_position,
    paymentStatus: data.payment_status,
    amountDue: data.amount_due,
    amountPaid: data.amount_paid,
    certificateIssued: data.certificate_issued,
    certificateUrl: data.certificate_url,
    registrationDate: data.registration_date,
  };
}

// Staff/admin operational views — no .eq("user_id", ...) filter, so the
// result set is exactly what the "read own or is_staff_or_admin()" RLS
// policy allows: a staff/admin session sees every row, anyone else sees
// only their own (safe default even if this were ever reached by a
// non-staff session).
//
// Capped, not unbounded — STAFF_VIEW_LIMIT for the day-to-day admin
// list page, REPORT_LIMIT (higher) for exports/reports (see
// src/lib/admin/reports/). Neither is "no limit at all": a single CSV/
// XLSX export beyond a few thousand rows stops being something anyone
// actually opens and starts being a pagination problem in disguise —
// flagged here rather than silently assumed unbounded.
const STAFF_VIEW_LIMIT = 100;
export const REPORT_LIMIT = 5000;

// User-supplied free-text search is folded into a PostgREST `.or()`
// filter string below — `%` and `,` are stripped first since both are
// syntactically meaningful there (comma separates OR conditions, so an
// unescaped one would let a search term inject an extra filter clause).
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%,]/g, "").trim();
}

export type EnquiryQueryFilters = {
  search?: string;
  stage?: string;
  paymentStatus?: string;
  service?: string;
  dateFrom?: string; // inclusive, ISO date or datetime
  dateTo?: string; // inclusive, ISO date or datetime
};

export async function getAllEnquiries(
  filters: EnquiryQueryFilters = {},
  limit: number = STAFF_VIEW_LIMIT
): Promise<PortalEnquiry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("enquiries")
    .select(
      "id, reference_number, email, full_name, phone, service, crm_stage, payment_status, amount_due, amount_paid, submitted_at"
    )
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (filters.stage) query = query.eq("crm_stage", filters.stage);
  if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
  if (filters.service) query = query.eq("service", filters.service);
  if (filters.dateFrom) query = query.gte("submitted_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("submitted_at", filters.dateTo);
  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,reference_number.ilike.%${term}%,phone.ilike.%${term}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal] failed to load all enquiries", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    referenceNumber: row.reference_number,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    service: row.service,
    crmStage: row.crm_stage,
    paymentStatus: row.payment_status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    submittedAt: row.submitted_at,
  }));
}

export type WorkshopRegistrationQueryFilters = {
  search?: string;
  status?: string;
  paymentStatus?: string;
  workshopSlug?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function getAllWorkshopRegistrations(
  filters: WorkshopRegistrationQueryFilters = {},
  limit: number = STAFF_VIEW_LIMIT
): Promise<PortalWorkshopRegistration[]> {
  const supabase = await createClient();
  let query = supabase
    .from("workshop_registrations")
    .select(
      "id, registration_reference, email, full_name, phone, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, amount_due, amount_paid, certificate_issued, certificate_url, registration_date"
    )
    .order("registration_date", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("registration_status", filters.status);
  if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
  if (filters.workshopSlug) query = query.eq("workshop_slug", filters.workshopSlug);
  if (filters.dateFrom) query = query.gte("registration_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("registration_date", filters.dateTo);
  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,registration_reference.ilike.%${term}%,phone.ilike.%${term}%,workshop_title.ilike.%${term}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal] failed to load all workshop registrations", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    registrationReference: row.registration_reference,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title,
    registrationStatus: row.registration_status,
    waitingListPosition: row.waiting_list_position,
    paymentStatus: row.payment_status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
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
