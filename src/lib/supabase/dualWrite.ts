import { createAdminClient } from "@/lib/supabase/admin";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import type { WorkshopRegistrationRecord } from "@/lib/workshops/registrationStorage";

type AdminClient = ReturnType<typeof createAdminClient>;

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

// Service-role-only RPC (see supabase/migrations/0003_find_user_by_email.sql)
// — links a submission to an existing account by email even when the
// submitter isn't logged in. Best-effort: any failure here just means
// the row is written with user_id null, same as a genuine guest.
async function findUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (error) {
    console.error("[supabase] find_user_id_by_email failed", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

// Mirrors the just-saved enquiry into Supabase so the Client Portal has
// something to query (src/app/portal/(dashboard)/client). Google Sheets
// (src/lib/enquiry/storage.ts) stays the primary, admin-facing record —
// this is additive and must never block or corrupt that flow. No-ops
// entirely if the Supabase project isn't configured yet (see
// src/lib/supabase/middleware.ts for the same guard pattern).
export async function dualWriteEnquiry(record: EnquiryRecord): Promise<void> {
  if (!supabaseConfigured()) return;

  try {
    const admin = createAdminClient();
    const userId = await findUserIdByEmail(admin, record.email);

    const { error } = await admin.from("enquiries").insert({
      user_id: userId,
      reference_number: record.referenceNumber,
      email: record.email,
      full_name: record.fullName,
      service: record.service,
      submitted_at: record.submittedAt,
    });

    if (error) {
      console.error("[supabase] dual-write enquiry failed", record.referenceNumber, error.message);
    }
  } catch (err) {
    console.error("[supabase] dual-write enquiry threw", record.referenceNumber, err);
  }
}

// Same pattern as dualWriteEnquiry, plus: on an email match, auto-grants
// the workshop_participant role (referenced in
// src/app/portal/signup/actions.ts and src/lib/portal/roles.ts as "not
// yet implemented" — this is that implementation).
export async function dualWriteWorkshopRegistration(
  record: WorkshopRegistrationRecord
): Promise<void> {
  if (!supabaseConfigured()) return;

  try {
    const admin = createAdminClient();
    const userId = await findUserIdByEmail(admin, record.email);

    const { error } = await admin.from("workshop_registrations").insert({
      user_id: userId,
      registration_reference: record.registrationReference,
      email: record.email,
      full_name: record.fullName,
      workshop_id: record.workshopId,
      workshop_slug: record.workshopSlug,
      workshop_title: record.workshopTitle,
      registration_status: record.registrationStatus,
      waiting_list_position: record.waitingListPosition,
      payment_status: record.paymentStatus,
      registration_date: record.registrationDate,
    });

    if (error) {
      console.error(
        "[supabase] dual-write workshop registration failed",
        record.registrationReference,
        error.message
      );
    }

    if (userId) {
      await grantWorkshopParticipantRole(admin, userId);
    }
  } catch (err) {
    console.error("[supabase] dual-write workshop registration threw", record.registrationReference, err);
  }
}

async function grantWorkshopParticipantRole(admin: AdminClient, userId: string): Promise<void> {
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("slug", "workshop_participant")
    .single();
  if (roleError || !role) {
    console.error("[supabase] couldn't look up workshop_participant role", roleError?.message);
    return;
  }

  const { error } = await admin
    .from("user_roles")
    .upsert(
      { user_id: userId, role_id: role.id },
      { onConflict: "user_id,role_id", ignoreDuplicates: true }
    );
  if (error) {
    console.error("[supabase] failed to grant workshop_participant role", userId, error.message);
  }
}
