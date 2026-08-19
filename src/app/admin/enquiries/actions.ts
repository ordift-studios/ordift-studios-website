"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { logActivity } from "@/lib/admin/activityLog";
import { CRM_STAGES, type CrmStage } from "@/lib/admin/enquiries";
import { crmStageLabel } from "@/lib/portal/data";

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

// useActionState-compatible result — Admin Platform UX audit (2026-08-19):
// the previous plain void action gave the admin zero visible feedback on
// whether a stage change was saving, saved, or silently failed (a real
// attempt on ENQ-2026-000007 appeared to "revert" with no explanation).
// Matches the SetAmountDueState pattern (setAmountDueAction) exactly.
export type UpdateStageState = { ok: boolean; error?: string; stageLabel?: string } | null;

export async function updateStageAction(
  _prevState: UpdateStageState,
  formData: FormData
): Promise<UpdateStageState> {
  let user;
  try {
    user = await requireStaffOrAdmin();
  } catch {
    return { ok: false, error: "You are not authorized to change this." };
  }

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!enquiryId || !isCrmStage(stage)) {
    return { ok: false, error: "Select a valid stage." };
  }

  const supabase = await createClient();

  // Atomic conditional UPDATE, not a prior read-then-write — the same
  // guard shape proven necessary by setAmountDueAction's own double-
  // submit fix. A double-click or slow-network retry submitting the
  // same target stage twice must never log two identical activity
  // rows; the "is this actually a change" check lives in the UPDATE's
  // own WHERE clause, not a separate SELECT.
  const { data: updatedRows, error } = await supabase
    .from("enquiries")
    .update({ crm_stage: stage })
    .eq("id", enquiryId)
    .neq("crm_stage", stage)
    .select("id");

  if (error) {
    console.error("[admin] enquiry stage update failed", error.message);
    return { ok: false, error: "Save failed. Please try again." };
  }

  if (updatedRows && updatedRows.length > 0) {
    await logActivity({
      actorUserId: user.id,
      action: "enquiry.stage_change",
      entityType: "enquiry",
      entityId: enquiryId,
      metadata: { stage },
    });
  }

  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/enquiries");

  return { ok: true, stageLabel: crmStageLabel(stage) };
}

// Stages before "quotation_sent" in the CRM pipeline — setting an
// amount auto-advances the stage only from one of these, never
// regressing a stage the admin has already moved further along
// (e.g. "booked") back to "quotation_sent".
const PRE_QUOTATION_STAGES: readonly CrmStage[] = ["new_lead", "contacted", "discovery_meeting"];

// useActionState-compatible result — lets the form (SetAmountDueForm)
// show a real pending/success/error state instead of a fire-and-forget
// submit, matching the pattern already established for CheckoutForm
// (TD-036). `ok` distinguishes "nothing to report" from an actual
// problem the admin should see.
export type SetAmountDueState = { ok: boolean; error?: string } | null;

// Turns a mere enquiry into a payable obligation (PAYMENT_FINANCE_
// ARCHITECTURE_PROPOSAL.md's Payments tab gate) — deliberately a plain
// UPDATE, not an append-only ledger like exchange_rates: this is a
// working "current invoice target" an admin can amend as scope
// changes, not an immutable financial record (completed payments
// themselves remain the immutable record). Amount is always USD,
// matching the module's reference-currency architecture — no separate
// currency field.
export async function setAmountDueAction(
  _prevState: SetAmountDueState,
  formData: FormData
): Promise<SetAmountDueState> {
  const user = await requireManageProjectAmount();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const amountRaw = String(formData.get("amountDue") ?? "");
  const amountDue = Number(amountRaw);
  if (!enquiryId || !Number.isFinite(amountDue) || amountDue <= 0 || amountDue > 1_000_000) {
    return { ok: false, error: "Enter a valid amount." };
  }

  const supabase = await createClient();
  const roundedAmount = Math.round(amountDue * 100) / 100;

  const { data: current } = await supabase
    .from("enquiries")
    .select("crm_stage")
    .eq("id", enquiryId)
    .maybeSingle();

  const updates: { amount_due: number; crm_stage?: CrmStage } = {
    amount_due: roundedAmount,
  };
  if (current && PRE_QUOTATION_STAGES.includes(current.crm_stage as CrmStage)) {
    updates.crm_stage = "quotation_sent";
  }

  // Atomic guard against a repeated identical submission (a double-
  // click that beats the client-side disable, a slow-network retry,
  // two tabs) — the "is this actually a change" check is part of the
  // same conditional UPDATE, not a separate preceding read. A plain
  // read-then-compare-then-write here would race exactly the way
  // TD-043's own original defect did: this project's regression test
  // for this fix (setAmountDueDoubleSubmit.integration.test.ts) proved
  // a naive prior version of this guard let all 9 concurrent
  // submissions through under real load, because every one of them
  // read the same pre-write value before any of them committed. The
  // `.or(...)` clause is Postgres NULL-safe — it matches both "was
  // never set" and "was a different number" — so a row is affected
  // only when the value is genuinely changing; a genuinely different
  // amount (including reverting to an earlier value later) always
  // proceeds and is logged.
  const { data: updatedRows, error } = await supabase
    .from("enquiries")
    .update(updates)
    .eq("id", enquiryId)
    .or(`amount_due.is.null,amount_due.neq.${roundedAmount}`)
    .select("id");

  if (error) {
    console.error("[admin] enquiry amount_due update failed", error.message);
    return { ok: false, error: "Save failed. Please try again." };
  }

  if (!updatedRows || updatedRows.length === 0) {
    // The requested amount already matched what's on the row — a
    // legitimate no-op, not an error. Nothing to log.
    return { ok: true };
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

  return { ok: true };
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
