"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { isProjectKind } from "@/lib/portal/collaboratorData";

// Insert-only, via the session client (not the admin client) — RLS
// policy "project_updates: contractor insert assigned own" (migration
// 0009) is the actual authorization here: it requires
// author_user_id = auth.uid() AND an active project_assignments row
// for this exact project, so there is nothing left for this action to
// check beyond basic input shape.
export async function postProjectUpdateAction(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "contractor")) {
    return { error: "Not authorized." };
  }

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim();
  if (!isProjectKind(kind) || !id || !note) {
    return { error: "Enter an update before posting." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_updates").insert({
    entity_type: kind === "enquiry" ? "enquiry" : "workshop_registration",
    entity_id: id,
    author_user_id: user.id,
    note,
    link_url: linkUrl || null,
  });

  if (error) {
    console.error("[portal collaborator] failed to post update", error.message);
    return { error: "Couldn't post — you may no longer be assigned to this project." };
  }

  revalidatePath(`/portal/collaborator/${kind}/${id}`);
  return {};
}
