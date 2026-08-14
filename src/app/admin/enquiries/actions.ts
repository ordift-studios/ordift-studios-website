"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { logActivity } from "@/lib/admin/activityLog";
import { CRM_STAGES, type CrmStage } from "@/lib/admin/enquiries";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

// Narrower than requireStaffOrAdmin() — setting the payable amount has
// direct financial consequences (same tier as issue_refund/
// manage_currencies in PAYMENT_CAPABILITIES), so plain staff can't do
// this even though they can update crm_stage/notes above.
async function requireManageProjectAmount() {
  const user = await getCurrentUser();
  if (!user || !hasCapability(user, PAYMENT_CAPABILITIES, "manage_project_amount")) {
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

// Stages before "quotation_sent" in the CRM pipeline — setting an
// amount auto-advances the stage only from one of these, never
// regressing a stage the admin has already moved further along
// (e.g. "booked") back to "quotation_sent".
const PRE_QUOTATION_STAGES: readonly CrmStage[] = ["new_lead", "contacted", "discovery_meeting"];

// Turns a mere enquiry into a payable obligation (PAYMENT_FINANCE_
// ARCHITECTURE_PROPOSAL.md's Payments tab gate) — deliberately a plain
// UPDATE, not an append-only ledger like exchange_rates: this is a
// working "current invoice target" an admin can amend as scope
// changes, not an immutable financial record (completed payments
// themselves remain the immutable record). Amount is always USD,
// matching the module's reference-currency architecture — no separate
// currency field.
export async function setAmountDueAction(formData: FormData): Promise<void> {
  const user = await requireManageProjectAmount();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const amountRaw = String(formData.get("amountDue") ?? "");
  const amountDue = Number(amountRaw);
  if (!enquiryId || !Number.isFinite(amountDue) || amountDue <= 0 || amountDue > 1_000_000) return;

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("enquiries")
    .select("crm_stage")
    .eq("id", enquiryId)
    .maybeSingle();

  const updates: { amount_due: number; crm_stage?: CrmStage } = {
    amount_due: Math.round(amountDue * 100) / 100,
  };
  if (current && PRE_QUOTATION_STAGES.includes(current.crm_stage as CrmStage)) {
    updates.crm_stage = "quotation_sent";
  }

  const { error } = await supabase.from("enquiries").update(updates).eq("id", enquiryId);
  if (error) {
    console.error("[admin] enquiry amount_due update failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "enquiry.amount_due_set",
    entityType: "enquiry",
    entityId: enquiryId,
    metadata: { amountDue: updates.amount_due, stageAdvanced: Boolean(updates.crm_stage) },
  });

  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/enquiries");
  revalidatePath(`/portal/client/projects/enquiry/${enquiryId}/payments`);
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
