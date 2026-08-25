"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { createWorkshopDraft, patchWorkshopCoreFields, type WorkshopCoreFields } from "@/lib/content/sanity/workshopAdmin";
import { createTicketType, setTicketTypeActive } from "@/lib/workshops/ticketTypes";
import { createInstructorEngagement, linkEngagementToPaymentObligation } from "@/lib/workshops/instructorEngagements";
import { approvePaymentObligation } from "@/lib/payments/payoutObligations";

// Workshop Management V1, Phase B, Part 13 (2026-08-25). Overall
// workshop administration (content, ticket types) requires
// operations.workshop.administer or Super Admin — PRIME's jurisdiction,
// per the Part 4 mapping. Every write here uses
// authorizeWithSuperAdminOverride() so a Super Admin intervention (no
// one occupies PRIME yet) is recorded honestly in activity_log rather
// than implying PRIME acted (Part 5's explicit requirement).
async function requireWorkshopAdminister() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) throw new Error("Not authorized to manage Workshop Management.");
  return { user, actedAsOverride: auth.actedAsOverride };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readCoreFields(formData: FormData): WorkshopCoreFields {
  const title = String(formData.get("title") ?? "").trim();
  return {
    title,
    slug: String(formData.get("slug") ?? "").trim() || slugify(title),
    status: String(formData.get("status") ?? "coming-soon"),
    shortDescription: String(formData.get("shortDescription") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    venueId: String(formData.get("venueId") ?? "").trim() || null,
    capacity: Number(formData.get("capacity") ?? 1) || 1,
    displayCurrency: String(formData.get("displayCurrency") ?? "").trim() || null,
    timezone: String(formData.get("timezone") ?? "").trim() || null,
    startDate: String(formData.get("startDate") ?? "").trim() || null,
    endDate: String(formData.get("endDate") ?? "").trim() || null,
    registrationOpensAt: String(formData.get("registrationOpensAt") ?? "").trim() || null,
    registrationDeadline: String(formData.get("registrationDeadline") ?? "").trim() || null,
    requiresPayment: formData.get("requiresPayment") === "on",
    attendeeTerms: String(formData.get("attendeeTerms") ?? "").trim() || null,
    internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
  };
}

export async function createWorkshopAction(formData: FormData): Promise<void> {
  const { user, actedAsOverride } = await requireWorkshopAdminister();
  const fields = readCoreFields(formData);
  if (!fields.title || !fields.shortDescription || !fields.description) return;

  const id = await createWorkshopDraft(fields);

  await logActivity({
    actorUserId: user.id,
    action: "workshop.created",
    entityType: "workshop",
    entityId: id,
    metadata: { title: fields.title, actedAsSuperAdminOverride: actedAsOverride, normalJurisdiction: OPERATIONS_CAPABILITIES.workshopAdminister },
  });

  revalidatePath("/admin/workshops");
  redirect(`/admin/workshops/${id}`);
}

export async function updateWorkshopAction(formData: FormData): Promise<void> {
  const { user, actedAsOverride } = await requireWorkshopAdminister();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const fields = readCoreFields(formData);
  if (!fields.title || !fields.shortDescription || !fields.description) return;

  await patchWorkshopCoreFields(id, fields);

  await logActivity({
    actorUserId: user.id,
    action: "workshop.updated",
    entityType: "workshop",
    entityId: id,
    metadata: { title: fields.title, status: fields.status, actedAsSuperAdminOverride: actedAsOverride, normalJurisdiction: OPERATIONS_CAPABILITIES.workshopAdminister },
  });

  revalidatePath("/admin/workshops");
  revalidatePath(`/admin/workshops/${id}`);
  redirect(`/admin/workshops/${id}`);
}

export async function createTicketTypeAction(formData: FormData): Promise<void> {
  const { user } = await requireWorkshopAdminister();

  const workshopId = String(formData.get("workshopId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const priceUsd = Number(formData.get("priceUsd") ?? 0) || 0;
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const saleStartsAt = String(formData.get("saleStartsAt") ?? "").trim() || null;
  const saleEndsAt = String(formData.get("saleEndsAt") ?? "").trim() || null;
  const perPersonLimitRaw = String(formData.get("perPersonLimit") ?? "").trim();
  if (!workshopId || !name) return;

  const result = await createTicketType({
    workshopId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    priceUsd,
    capacity: capacityRaw ? Number(capacityRaw) : null,
    saleStartsAt,
    saleEndsAt,
    perPersonLimit: perPersonLimitRaw ? Number(perPersonLimitRaw) : null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin workshops] failed to create ticket type", result.error);

  revalidatePath(`/admin/workshops/${workshopId}`);
}

export async function toggleTicketTypeAction(formData: FormData): Promise<void> {
  const { user } = await requireWorkshopAdminister();
  const ticketTypeId = String(formData.get("ticketTypeId") ?? "");
  const active = formData.get("active") === "true";
  const workshopId = String(formData.get("workshopId") ?? "");
  if (!ticketTypeId) return;

  const result = await setTicketTypeActive({ ticketTypeId, active: !active, actorUserId: user.id });
  if (!result.ok) console.error("[admin workshops] failed to toggle ticket type", result.error);

  if (workshopId) revalidatePath(`/admin/workshops/${workshopId}`);
}

export async function createInstructorEngagementAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const workshopId = String(formData.get("workshopId") ?? "");
  const profileId = String(formData.get("profileId") ?? "").trim() || null;
  const externalPayeeName = String(formData.get("externalPayeeName") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "instructor").trim();
  const amountRaw = String(formData.get("agreedCompensationAmount") ?? "").trim();
  const currency = String(formData.get("agreedCompensationCurrency") ?? "").trim() || null;
  if (!workshopId) return;

  const result = await createInstructorEngagement({
    workshopId,
    profileId,
    externalPayeeName,
    role,
    agreedCompensationAmount: amountRaw ? Number(amountRaw) : null,
    agreedCompensationCurrency: currency,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin workshops] failed to create instructor engagement", result.error);

  revalidatePath(`/admin/workshops/${workshopId}`);
}

export async function linkEngagementPayoutObligationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const engagementId = String(formData.get("engagementId") ?? "");
  const workshopId = String(formData.get("workshopId") ?? "");
  if (!engagementId) return;

  const result = await linkEngagementToPaymentObligation({ engagementId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin workshops] failed to link payment obligation", result.error);

  if (workshopId) revalidatePath(`/admin/workshops/${workshopId}`);
}

// VAULT's real enforcement point for finance.payment_obligation.approve
// — reused directly from Phase 3.4, not re-implemented. Exposed here so
// the unified Workshop Management dashboard can approve an instructor
// compensation obligation without leaving the module (Part 1's "one
// unified module" requirement) — the underlying authorization and
// audit trail is identical to approving any other payment obligation.
export async function approveWorkshopObligationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const obligationId = String(formData.get("obligationId") ?? "");
  const workshopId = String(formData.get("workshopId") ?? "");
  if (!obligationId) return;

  const result = await approvePaymentObligation({ obligationId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin workshops] failed to approve obligation", result.error);

  if (workshopId) revalidatePath(`/admin/workshops/${workshopId}`);
}
