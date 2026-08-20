"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import type { DeliverableEntityType } from "@/lib/admin/deliverables";
import { sendFilesReadyEmail } from "@/lib/enquiry/lifecycleEmails";
import { pathwayLabel } from "@/lib/enquiry/pathways";

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

// A duplicate created within this window is treated as an accidental
// resubmission (double-click, slow-network retry, back-button replay)
// — not a schema-level uniqueness constraint (deliberately, per
// instruction: no migration unless genuinely necessary), but combined
// with the client-side pending-disable guard (PublishDeliverableForm.tsx),
// this closes the realistic case without one. A staff member
// genuinely re-publishing the exact same title+url later (a rare,
// deliberate action) is unaffected — the window is short.
const DUPLICATE_PUBLISH_WINDOW_SECONDS = 15;

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

  // Duplicate-publish check — see DUPLICATE_PUBLISH_WINDOW_SECONDS above.
  // A read-then-write, not an atomic guard (this table has no unique
  // constraint to condition an UPDATE on, unlike the CRM-stage guards
  // elsewhere in this project) — a genuinely simultaneous race from two
  // different tabs could theoretically still slip through, but the
  // client-side pending-disable guard already prevents the common
  // same-tab double-click case at the source, so this is a deliberate,
  // proportionate defense-in-depth choice, not a claim of atomicity.
  const sinceIso = new Date(Date.now() - DUPLICATE_PUBLISH_WINDOW_SECONDS * 1000).toISOString();
  const { data: recentDuplicate } = await supabase
    .from("deliverables")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("title", title)
    .eq("url", url)
    .gte("published_at", sinceIso)
    .maybeSingle();

  if (recentDuplicate) {
    // Already published moments ago — a legitimate no-op, not an
    // error. No second insert, no second activity row, no second email.
    return { ok: true };
  }

  const { error } = await supabase.from("deliverables").insert({
    entity_type: entityType,
    entity_id: entityId,
    category_id: categoryId,
    title,
    description: description || null,
    url,
    thumbnail_url: thumbnailUrl || null,
    published_by: user.id,
  });
  if (error) {
    console.error("[admin] deliverable insert failed", error.message);
    return { ok: false, error: "Save failed. Please try again." };
  }

  await logActivity({
    actorUserId: user.id,
    action: "deliverable.published",
    entityType,
    entityId,
    metadata: { title },
  });

  // Files Ready client email — fires only after the insert above has
  // genuinely succeeded (this line is unreached on any failure or
  // duplicate-publish return above). Deliberately does not touch
  // crm_stage — publishing an individual deliverable and completing
  // the overall project remain separate concepts for now. A failure
  // resolving contact details or sending must never fail this
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
