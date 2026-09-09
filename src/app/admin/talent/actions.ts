"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { setRepresentationStatus, setPublicationStatus, createTalentCategory, assignTalentCategory, removeTalentCategory, createTalentProfile } from "@/lib/talent/talentProfiles";
import { setTalentMeasurements } from "@/lib/talent/talentMeasurementsEngine";
import { setCommercialTerms } from "@/lib/talent/talentCommercialTermsEngine";
import { isValidCommissionType } from "@/lib/talent/talentCommercialTerms";
import type { RepresentationStatus } from "@/lib/talent/talentRepresentation";
import type { TalentPublicationStatus } from "@/lib/talent/talentPublicationLifecycle";

// Ordift Talent — TALENT-SYS-2B, Phase 2 (2026-09-08). Plain
// server-action forms, same shape/precedent as
// src/app/admin/lookups/actions.ts — every function checks
// authorization itself (via the DORMANT talent.* capabilities, through
// the lib functions this file calls), so a thrown error here always
// means "not authorized," never a silent no-op.

export async function setRepresentationStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const profileId = String(formData.get("profileId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "") as RepresentationStatus;
  if (!profileId || !toStatus) return;

  const result = await setRepresentationStatus({ profileId, toStatus, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to set representation status", result.error);
  revalidatePath(`/admin/talent/${profileId}`);
  revalidatePath("/admin/talent");
}

export async function setPublicationStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const profileId = String(formData.get("profileId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "") as TalentPublicationStatus;
  if (!profileId || !toStatus) return;

  const result = await setPublicationStatus({ profileId, toStatus, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to set publication status", result.error);
  revalidatePath(`/admin/talent/${profileId}`);
  revalidatePath("/admin/talent");
}

export async function setTalentMeasurementsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return;

  const numOrNull = (key: string): number | null => {
    const raw = formData.get(key);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const strOrNull = (key: string): string | null => {
    const raw = formData.get(key);
    return raw === null || raw === "" ? null : String(raw);
  };

  const result = await setTalentMeasurements({
    profileId,
    heightCm: numOrNull("heightCm"),
    bustCm: numOrNull("bustCm"),
    waistCm: numOrNull("waistCm"),
    hipCm: numOrNull("hipCm"),
    shoeEu: numOrNull("shoeEu"),
    hairColor: strOrNull("hairColor"),
    eyeColor: strOrNull("eyeColor"),
    languages: String(formData.get("languages") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    travelReady: formData.get("travelReady") === "on",
    location: strOrNull("location"),
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to set talent measurements", result.error);
  revalidatePath(`/admin/talent/${profileId}`);
}

// Category-add button feedback (2026-09-09) — signature changed from a
// plain (formData) => Promise<void> to the (prevState, formData) =>
// Promise<State> shape useActionState requires, so AddCategoryForm.tsx
// can show pending/success/error state. createTalentCategory() itself
// (talentProfiles.ts) — including its authorization check and the
// actual insert — is completely unchanged; this only wires its
// existing return value through to the client instead of swallowing it
// after a console.error.
export type CreateTalentCategoryState = { ok: boolean; error?: string } | null;

export async function createTalentCategoryAction(_prevState: CreateTalentCategoryState, formData: FormData): Promise<CreateTalentCategoryState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Category name is required." };
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const result = await createTalentCategory({ slug, name, actorUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/talent");
  return { ok: true };
}

// Assign-category button feedback (2026-09-09) — same useActionState
// pending/success/error shape as createTalentCategoryAction/
// createTalentProfileAction (AddCategoryForm.tsx/NewTalentForm.tsx),
// reused rather than invented fresh: the form previously bound
// directly to this action with no client wrapper, so a click gave no
// pending state and, on failure, no feedback at all (only a
// server-side console.error — a real, if unlikely, silent-failure gap
// this also closes). assignTalentCategory()'s own logic —
// authorization (requireProfileAdminister -> Super Admin override),
// the talent_profile_categories insert, its duplicate protection (DB
// unique constraint + the caller only ever offering unassigned
// categories), and the activity log — is completely unchanged; this
// only changes what gets reported back to the caller.
export type AssignCategoryState = { ok: boolean; error?: string } | null;

export async function assignTalentCategoryAction(_prevState: AssignCategoryState, formData: FormData): Promise<AssignCategoryState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const profileId = String(formData.get("profileId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!profileId || !categoryId) return { ok: false, error: "Select a category to assign." };

  const result = await assignTalentCategory({ profileId, categoryId, actorUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/talent/${profileId}`);
  return { ok: true };
}

export async function removeTalentCategoryAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const profileId = String(formData.get("profileId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!profileId || !categoryId) return;

  const result = await removeTalentCategory({ profileId, categoryId, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to remove talent category", result.error);
  revalidatePath(`/admin/talent/${profileId}`);
}

// Admin onboarding, "Add Talent" (2026-09-09) — same useActionState
// pending/success/error shape as checkPulseSourcePolicyAction/
// createTalentCategoryAction (AddCategoryForm.tsx), reused rather than
// invented fresh. Real authorization lives in createTalentProfile()
// itself (requireProfileAdminister — talent.profile.administer, with
// the existing Super Admin override) — this action never bypasses
// that; a not-signed-in caller is refused before even reaching it.
export type CreateTalentProfileState = { ok: boolean; error?: string } | null;

export async function createTalentProfileAction(_prevState: CreateTalentProfileState, formData: FormData): Promise<CreateTalentProfileState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, error: "Select a person to onboard." };
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const representationStatusRaw = String(formData.get("representationStatus") ?? "").trim();
  const representationStatus = representationStatusRaw ? (representationStatusRaw as RepresentationStatus) : null;

  const result = await createTalentProfile({ profileId, categoryId, representationStatus, actorUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${profileId}`);
  redirect(`/admin/talent/${profileId}`);
}

// Commercial Terms Admin UI (2026-09-09) — same useActionState
// pending/success/error shape as assignTalentCategoryAction/
// createTalentProfileAction, applied from the start here (not
// retrofitted after the fact, learning from the earlier Assign
// Category gap). Business logic — commission-type/value validation,
// the "never a default commission value" guarantee, currency
// requirement for flat_fee, percentage capping, authorization
// (requireCommercialTermsAdminister), the talent_commercial_terms
// upsert, and the activity log — all live entirely in
// setCommercialTerms()/validateCommercialTerms() (talentCommercialTermsEngine.ts/
// talentCommercialTerms.ts), completely unchanged. This wrapper only
// parses form strings into that function's existing typed params and
// reports back what it returns — no business rule is duplicated or
// reimplemented here.
export type SetCommercialTermsState = { ok: boolean; error?: string } | null;

export async function setCommercialTermsAction(_prevState: SetCommercialTermsState, formData: FormData): Promise<SetCommercialTermsState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, error: "Missing talent profile." };

  const commissionType = String(formData.get("commissionType") ?? "");
  if (!isValidCommissionType(commissionType)) return { ok: false, error: "Select a commission type." };

  // Disabled fields are never included in submitted FormData — the
  // form disables commissionValue/currency whenever "none" is
  // selected, so this naturally arrives as null for "none" without
  // any special-casing here. Where a value IS submitted, it's parsed,
  // never defaulted — validateCommercialTerms() (inside
  // setCommercialTerms()) is the sole authority on whether it's
  // actually required/valid for the chosen type.
  const commissionValueRaw = String(formData.get("commissionValue") ?? "").trim();
  let commissionValue: number | null = null;
  if (commissionValueRaw) {
    const parsed = Number(commissionValueRaw);
    if (Number.isNaN(parsed)) return { ok: false, error: "Commission value must be a number." };
    commissionValue = parsed;
  }

  const currency = String(formData.get("currency") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = await setCommercialTerms({ profileId, commissionType, commissionValue, currency, notes, actorUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/talent/${profileId}`);
  return { ok: true };
}
