"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import type { DeliverableEntityType } from "@/lib/admin/deliverables";
import { sendFilesReadyEmail } from "@/lib/enquiry/lifecycleEmails";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import type { CrmStage } from "@/lib/admin/enquiries";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

function entityBasePath(entityType: string): string {
  return entityType === "workshop_registration" ? "/admin/bookings" : "/admin/enquiries";
}

// CRM Lifecycle Automation Phase 1, Batch 5 (2026-08-20) — useActionState-
// compatible result, same save-feedback pattern already proven for
// every other admin action in this project (UpdateStageForm,
// SetAmountDueForm, StartHandlingButton). Previously this action
// returned void with no client-side pending/error feedback at all —
// the exact shape the "Admin Platform save-feedback audit" fixed
// elsewhere; adding a real client-facing email here means a silent
// double-submit is no longer merely a harmless duplicate list row, so
// it's fixed here too rather than left as-is.
export type CreateDeliverableState = { ok: boolean; error?: string } | null;

// CRM Lifecycle Automation Phase 1, Batch 6 (2026-08-20) — the only
// stages a deliverable publish may auto-advance FROM. Deliberately a
// positive allow-list, not "everything before delivered" — an enquiry
// that hasn't even been booked yet (new_lead/contacted/quotation_sent/
// negotiation) publishing a deliverable would be premature and should
// not auto-jump straight to "Delivered"; that stays a manual decision.
// Every stage at or after "delivered" (delivered itself, completed,
// repeat_client, referral, declined, closed) is excluded so this can
// never regress or duplicate-transition an enquiry already there.
const DELIVERY_ELIGIBLE_STAGES: readonly CrmStage[] = ["booked", "in_progress"];

export async function createDeliverableAction(
  _prevState: CreateDeliverableState,
  formData: FormData
): Promise<CreateDeliverableState> {
  let user;
  try {
    user = await requireStaffOrAdmin();
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }

  const entityType = String(formData.get("entityType") ?? "") as DeliverableEntityType;
  const entityId = String(formData.get("entityId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "").trim();
  if (!entityType || !entityId || !categoryId || !title || !url) {
    return { ok: false, error: "Fill in the title, category, and link." };
  }

  const supabase = await createClient();

  // Batch 5 hardening (2026-08-20) — the previous SELECT-then-INSERT
  // duplicate check was proven, empirically, not to be safe under real
  // concurrency (a 6-way Promise.all of identical requests produced 6
  // writes, not 1). publish_deliverable_with_claim() (migration 0034)
  // does the claim-acquisition and the actual deliverable insert
  // atomically in one Postgres transaction — genuinely race-proof,
  // enforced by a real unique index, not a subquery. requireStaffOrAdmin()
  // has already gated this request, so calling it via the admin client
  // is already-authorized bookkeeping, the same reasoning already used
  // elsewhere in this codebase for a session-authenticated action that
  // needs one atomic admin-privileged operation.
  const admin = createAdminClient();
  const { data: claimResult, error: claimError } = await admin.rpc("publish_deliverable_with_claim", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_category_id: categoryId,
    p_title: title,
    p_description: description || null,
    p_url: url,
    p_thumbnail_url: thumbnailUrl || null,
    p_published_by: user.id,
  });

  if (claimError) {
    // Includes a genuine insert failure (e.g. an invalid category_id) —
    // the whole function call rolled back atomically inside Postgres,
    // so no claim and no deliverable exist. Nothing to clean up here;
    // the same request can be retried immediately once corrected.
    console.error("[admin] deliverable publish failed", claimError.message);
    return { ok: false, error: "Save failed. Please try again." };
  }

  const result = claimResult?.[0];
  if (!result || result.claim_status === "duplicate") {
    // Already published moments ago (or currently being published by a
    // truly simultaneous request that won the claim) — a legitimate
    // no-op, not an error. No second deliverable, no second activity
    // row, no second email.
    return { ok: true };
  }

  await logActivity({
    actorUserId: user.id,
    action: "deliverable.published",
    entityType,
    entityId,
    metadata: { title },
  });

  // CRM stage auto-advance — Batch 6, deliberately independent of the
  // Files Ready email below (its own try/catch; neither can affect the
  // other or this already-successful publish). Only ever reached after
  // a genuine new insert (not a duplicate-publish no-op, not a failed
  // insert) — the exact same idempotency guarantee this action already
  // proved for the deliverable row and the two activity logs above
  // extends automatically to this transition too. Workshop
  // registrations have no crm_stage column, so this only ever applies
  // to entityType === "enquiry". Same atomic conditional UPDATE shape
  // as advanceStageOnFullPayment (crmStageSync.ts) — the "is this
  // still eligible" check lives in the UPDATE's own WHERE clause
  // (DELIVERY_ELIGIBLE_STAGES), not a preceding read, so this is safe
  // under concurrency and naturally idempotent: a repeat call (e.g. a
  // later deliverable published against an already-"delivered"
  // enquiry) always affects zero rows.
  if (entityType === "enquiry") {
    try {
      const { data: updatedRows, error: stageError } = await supabase
        .from("enquiries")
        .update({ crm_stage: "delivered" })
        .eq("id", entityId)
        .in("crm_stage", DELIVERY_ELIGIBLE_STAGES)
        .select("id");

      if (stageError) {
        console.error("[admin] deliverable-triggered stage advance failed", { entityId, error: stageError.message });
      } else if (updatedRows && updatedRows.length > 0) {
        await logActivity({
          actorUserId: user.id,
          action: "enquiry.stage_change",
          entityType,
          entityId,
          metadata: { stage: "delivered", automated: true, reason: "deliverable_published" },
        });
      }
    } catch (err) {
      console.error("[admin] deliverable-triggered stage advance threw", { entityId, err });
    }
  }

  // Files Ready client email — fires only after the insert above has
  // genuinely succeeded (this line is unreached on any failure or
  // duplicate-publish return above). Unaffected by the stage-advance
  // above or its outcome — publishing an individual deliverable and
  // completing the overall project remain separate concepts, and a
  // failure resolving contact details or sending must never fail this
  // already-successful publish.
  try {
    const entityTable = entityType === "enquiry" ? "enquiries" : "workshop_registrations";
    const entitySelect =
      entityType === "enquiry"
        ? "email, full_name, service, reference_number"
        : "email, full_name, workshop_title, registration_reference";
    const { data: entity } = await supabase.from(entityTable).select(entitySelect).eq("id", entityId).maybeSingle();

    const entityEmail = (entity as { email?: string } | null)?.email;
    const entityFullName = (entity as { full_name?: string } | null)?.full_name;

    if (entityEmail && entityFullName) {
      const referenceNumber =
        entityType === "enquiry"
          ? ((entity as { reference_number?: string })?.reference_number ?? entityId)
          : ((entity as { registration_reference?: string })?.registration_reference ?? entityId);
      const projectLabel =
        entityType === "enquiry"
          ? pathwayLabel((entity as { service?: string })?.service ?? "")
          : ((entity as { workshop_title?: string })?.workshop_title ?? "");

      const result = await sendFilesReadyEmail({
        entityId,
        portalKind: entityType === "enquiry" ? "enquiry" : "workshop",
        referenceNumber,
        fullName: entityFullName,
        email: entityEmail,
        projectLabel,
        deliverableTitle: title,
      });
      await logActivity({
        actorUserId: user.id,
        action: "deliverable.files_ready_email_sent",
        entityType,
        entityId,
        metadata: { ok: result?.ok ?? false, title },
      });
    }
  } catch (err) {
    console.error("[admin] deliverable files-ready email failed", { entityId, err });
  }

  revalidatePath(`${entityBasePath(entityType)}/${entityId}`);

  return { ok: true };
}

export async function deleteDeliverableAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const id = String(formData.get("id") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").delete().eq("id", id);
  if (error) {
    console.error("[admin] deliverable delete failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "deliverable.removed",
    entityType,
    entityId,
  });

  revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }

  const label = String(formData.get("label") ?? "").trim();
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!label) return;

  const key = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!key) return;

  const supabase = await createClient();
  const { error } = await supabase.from("deliverable_categories").insert({ key, label });
  if (error) {
    console.error("[admin] category insert failed", error.message);
    return;
  }

  if (entityType && entityId) {
    revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
  }
}
