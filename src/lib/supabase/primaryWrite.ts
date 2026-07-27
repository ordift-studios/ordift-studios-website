import { createAdminClient } from "@/lib/supabase/admin";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import type { WorkshopRegistrationRecord } from "@/lib/workshops/registrationStorage";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PrimaryWriteResult = { ok: true; userId: string | null } | { ok: false; error: string };

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

// Service-role-only RPC (see supabase/migrations/0003_find_user_by_email.sql)
// — links a submission to an existing account by email even when the
// submitter isn't logged in. Best-effort: any failure here just means
// the row is written with user_id null, same as a genuine guest — it
// never fails the primary write itself.
async function findUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (error) {
    console.error("[supabase] find_user_id_by_email failed", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

// Supabase is the primary, required application database for every
// public form (inverted 2026-07-27 — Google Sheets, previously
// primary/fail-closed, is now the secondary/best-effort copy; see
// src/lib/enquiry/storage.ts's syncEnquiryToSheets and
// GOOGLE_SHEETS_INTEGRATION.md). A failure here must fail the whole
// submission: the caller (src/app/api/enquiry/route.ts) returns 503
// rather than silently losing the record.
export async function saveEnquiryToSupabase(record: EnquiryRecord): Promise<PrimaryWriteResult> {
  if (!supabaseConfigured()) {
    console.error("[supabase] cannot save enquiry — Supabase is not configured");
    return { ok: false, error: "supabase-not-configured" };
  }

  try {
    const admin = createAdminClient();
    const userId = await findUserIdByEmail(admin, record.email);

    const { error } = await admin.from("enquiries").insert({
      user_id: userId,
      reference_number: record.referenceNumber,
      email: record.email,
      full_name: record.fullName,
      phone: record.phone,
      service: record.service,
      submitted_at: record.submittedAt,
    });

    if (error) {
      console.error("[supabase] primary write for enquiry failed", record.referenceNumber, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, userId };
  } catch (err) {
    console.error("[supabase] primary write for enquiry threw", record.referenceNumber, err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown-error" };
  }
}

// Same inversion as saveEnquiryToSupabase, plus: on an email match,
// auto-grants the workshop_participant role.
export async function saveWorkshopRegistrationToSupabase(
  record: WorkshopRegistrationRecord
): Promise<PrimaryWriteResult> {
  if (!supabaseConfigured()) {
    console.error("[supabase] cannot save workshop registration — Supabase is not configured");
    return { ok: false, error: "supabase-not-configured" };
  }

  try {
    const admin = createAdminClient();
    const userId = await findUserIdByEmail(admin, record.email);

    const { error } = await admin.from("workshop_registrations").insert({
      user_id: userId,
      registration_reference: record.registrationReference,
      email: record.email,
      full_name: record.fullName,
      phone: record.phone,
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
        "[supabase] primary write for workshop registration failed",
        record.registrationReference,
        error.message
      );
      return { ok: false, error: error.message };
    }

    if (userId) {
      await grantWorkshopParticipantRole(admin, userId);
    }
    return { ok: true, userId };
  } catch (err) {
    console.error(
      "[supabase] primary write for workshop registration threw",
      record.registrationReference,
      err
    );
    return { ok: false, error: err instanceof Error ? err.message : "unknown-error" };
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
