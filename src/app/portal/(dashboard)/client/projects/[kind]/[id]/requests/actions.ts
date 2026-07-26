"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind, type ProjectKind } from "@/lib/portal/workspace";
import { getEnquiryByIdForUser, getWorkshopRegistrationByIdForUser } from "@/lib/portal/data";

// Client-facing submission only — never touches status/staff_decision
// beyond the column defaults, so nothing a client submits can ever
// auto-apply or self-approve. RLS backs this up (project_requests:
// client insert own) but the app layer never trusts client input for
// anything beyond request_type_id and client_notes regardless.

export async function submitProjectRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const requestTypeId = String(formData.get("requestTypeId") ?? "");
  const clientNotes = String(formData.get("clientNotes") ?? "").trim();
  if (!isProjectKind(kind) || !id || !requestTypeId) return;

  const owner = await verifyOwnership(kind, id, user.id);
  if (!owner) return;

  const entityType = kind === "enquiry" ? "enquiry" : "workshop_registration";
  const supabase = await createClient();
  const { error } = await supabase.from("project_requests").insert({
    entity_type: entityType,
    entity_id: id,
    request_type_id: requestTypeId,
    client_notes: clientNotes || null,
    created_by: user.id,
  });
  if (error) {
    console.error("[portal] project request submit failed", error.message);
    return;
  }

  revalidatePath(`/portal/client/projects/${kind}/${id}/requests`);
}

async function verifyOwnership(kind: ProjectKind, id: string, userId: string): Promise<boolean> {
  if (kind === "enquiry") {
    return Boolean(await getEnquiryByIdForUser(id, userId));
  }
  return Boolean(await getWorkshopRegistrationByIdForUser(id, userId));
}
