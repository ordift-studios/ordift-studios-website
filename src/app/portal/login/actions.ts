"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { primaryPortalPath, type RoleSlug } from "@/lib/portal/roles";

export type LoginState = { error: string | null };

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Deliberately generic — never confirm/deny whether an email is
    // registered (same principle as every other form in this project:
    // no information leaks through error messages).
    return { error: "Invalid email or password." };
  }

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(slug)")
    .eq("user_id", data.user.id);
  const roles = (userRoles ?? [])
    .map((r) => (r.roles as unknown as { slug: RoleSlug } | null)?.slug)
    .filter((slug): slug is RoleSlug => Boolean(slug));

  redirect(next && next.startsWith("/portal") ? next : primaryPortalPath(roles));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}
