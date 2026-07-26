"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";

export type SignupState = { error: string | null };

// Self-service signup always grants only the `client` role — every other
// role (model, vendor, staff, admin) requires an existing admin to grant
// it from /portal/admin (see ADMIN_GRANTED_ONLY_ROLES in
// src/lib/portal/roles.ts). `workshop_participant` is granted
// automatically later, the first time a workshop registration email
// matches this account (see the dual-write in
// src/app/api/workshop-registration/route.ts).
export async function signUpAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !password || !fullName) {
    return { error: "Fill in your name, email, and password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const turnstileOk = await verifyTurnstileToken(
    String(formData.get("cf-turnstile-response") ?? "") || null
  );
  if (!turnstileOk) {
    return { error: "Verification failed. Please try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Couldn't create your account. Please try again." };
  }

  // The profiles row itself is created transactionally by the
  // handle_new_user() trigger on auth.users (see
  // supabase/migrations/0001_init.sql) — full_name comes from the
  // signUp() metadata above, not a separate insert here. Only role
  // assignment (Ordift-specific business logic, not something a generic
  // trigger should own) happens here, via the admin client since signUp
  // may not produce an active session yet (depends on whether email
  // confirmation is required at the project level).
  const admin = createAdminClient();
  const { data: clientRole } = await admin.from("roles").select("id").eq("slug", "client").single();
  if (clientRole) {
    await admin.from("user_roles").insert({ user_id: data.user.id, role_id: clientRole.id });
  }

  if (!data.session) {
    redirect("/portal/login?confirmEmail=1");
  }

  redirect("/portal/client");
}
