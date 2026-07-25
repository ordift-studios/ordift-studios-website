import { createClient } from "@/lib/supabase/server";
import type { PortalWorkshopRegistration } from "@/lib/portal/data";

export async function getRegistrationById(id: string): Promise<PortalWorkshopRegistration | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_registrations")
    .select(
      "id, registration_reference, email, full_name, workshop_slug, workshop_title, registration_status, waiting_list_position, payment_status, certificate_issued, certificate_url, registration_date"
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
    workshopSlug: data.workshop_slug,
    workshopTitle: data.workshop_title,
    registrationStatus: data.registration_status,
    waitingListPosition: data.waiting_list_position,
    paymentStatus: data.payment_status,
    certificateIssued: data.certificate_issued,
    certificateUrl: data.certificate_url,
    registrationDate: data.registration_date,
  };
}

// Mirrors src/lib/workshops/registrationStorage.ts's actual enums — no
// new status vocabulary invented here.
export const REGISTRATION_STATUSES = ["Registered", "Waitlisted"] as const;
export const PAYMENT_STATUSES = ["Not Required", "Pending", "Paid", "Refunded"] as const;

export type RegistrationStatusValue = (typeof REGISTRATION_STATUSES)[number];
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];
