import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Reverse-direction counterpart to primaryWrite.ts's findUserIdByEmail:
// that function links a NEW submission to an EXISTING account (forward
// direction, at submission time). This links EXISTING guest-submitted
// enquiries/workshop_registrations to an account the moment a real,
// authenticated session is established for a matching email — called
// from both the login and signup server actions (2026-08-07).
//
// Same trust boundary as findUserIdByEmail, applied in reverse:
// establishing a session (password + Supabase's own email-confirmation
// gate, when enabled) is at least as strong a proof of ownership as the
// bare email match findUserIdByEmail already relies on for the forward
// direction — this doesn't lower the security bar, it extends the same
// one. Runs on the admin (service-role) client since RLS on both tables
// only allows a client to update rows they already own — by
// definition, a not-yet-linked guest row has no owning session.
//
// Best-effort: never throws, never blocks login/signup on failure.
export async function linkGuestRecordsToAccount(userId: string, email: string): Promise<void> {
  const admin: AdminClient = createAdminClient();

  const { error: enquiryError } = await admin
    .from("enquiries")
    .update({ user_id: userId })
    .is("user_id", null)
    .ilike("email", email);
  if (enquiryError) {
    console.error("[accountLinking] enquiries link failed", enquiryError.message);
  }

  const { data: linkedRegistrations, error: registrationError } = await admin
    .from("workshop_registrations")
    .update({ user_id: userId })
    .is("user_id", null)
    .ilike("email", email)
    .select("id");
  if (registrationError) {
    console.error("[accountLinking] workshop_registrations link failed", registrationError.message);
  }

  // Mirrors saveWorkshopRegistrationToSupabase's own role grant
  // (src/lib/supabase/primaryWrite.ts) — a client whose guest
  // registration just got linked needs the same workshop_participant
  // role a submission-time match would have granted.
  if (linkedRegistrations && linkedRegistrations.length > 0) {
    await grantWorkshopParticipantRole(admin, userId);
  }
}

async function grantWorkshopParticipantRole(admin: AdminClient, userId: string): Promise<void> {
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("slug", "workshop_participant")
    .single();
  if (roleError || !role) {
    console.error("[accountLinking] couldn't look up workshop_participant role", roleError?.message);
    return;
  }

  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  if (error) {
    console.error("[accountLinking] failed to grant workshop_participant role", userId, error.message);
  }
}
