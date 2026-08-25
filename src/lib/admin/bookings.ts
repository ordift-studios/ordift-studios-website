import { createClient } from "@/lib/supabase/server";
import type { PortalWorkshopRegistration } from "@/lib/portal/data";

// Workshop Management V1, Phase B (2026-08-25) — admin-only extension
// of the shared client-portal type, kept local to this file rather than
// widening PortalWorkshopRegistration (which several client-facing read
// paths also construct) just for one admin-only field.
export type AdminWorkshopRegistration = PortalWorkshopRegistration & {
  attendanceStatus: string | null;
  ticketTypeId: string | null;
};

export async function getRegistrationById(id: string): Promise<AdminWorkshopRegistration | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_registrations")
    .select(
      "id, registration_reference, email, full_name, phone, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, amount_due, amount_paid, certificate_issued, certificate_url, registration_date, attendance_status, ticket_type_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin] failed to load workshop registration", error.message);
    return null;
  }
  if (!data) return null;

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
    attendanceStatus: data.attendance_status,
    ticketTypeId: data.ticket_type_id,
  };
}

// Mirrors src/lib/workshops/registrationStorage.ts's actual enums — no
// new status vocabulary invented here.
export const REGISTRATION_STATUSES = ["Registered", "Waitlisted"] as const;
export const PAYMENT_STATUSES = ["Not Required", "Pending", "Paid", "Refunded"] as const;

export type RegistrationStatusValue = (typeof REGISTRATION_STATUSES)[number];
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];
