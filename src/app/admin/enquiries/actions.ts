"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { CRM_STAGES, type CrmStage } from "@/lib/admin/enquiries";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

function isCrmStage(value: string): value is CrmStage {
  return (CRM_STAGES as readonly string[]).includes(value);
}

export async function updateStageAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!enquiryId || !isCrmStage(stage)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("enquiries").update({ crm_stage: stage }).eq("id", enquiryId);
  if (error) {
    console.error("[admin] enquiry stage update failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "enquiry.stage_change",
    entityType: "enquiry",
    entityId: enquiryId,
    metadata: { stage },
  });

  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/enquiries");
}

const NOTE_AUDIENCES = ["internal", "client"] as const;
type NoteAudience = (typeof NOTE_AUDIENCES)[number];

function isNoteAudience(value: string): value is NoteAudience {
  return (NOTE_AUDIENCES as readonly string[]).includes(value);
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const audienceInput = String(formData.get("audience") ?? "internal");
  // Defaults to "internal" on anything unrecognized — a note only ever
  // becomes client-visible when explicitly marked, never by omission.
  const audience: NoteAudience = isNoteAudience(audienceInput) ? audienceInput : "internal";
  if (!enquiryId || !note) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("enquiry_notes")
    .insert({ enquiry_id: enquiryId, author_user_id: user.id, note, audience });
  if (error) {
    console.error("[admin] enquiry note insert failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "enquiry.note_added",
    entityType: "enquiry",
    entityId: enquiryId,
    metadata: { audience },
  });

  revalidatePath(`/admin/enquiries/${enquiryId}`);
}
