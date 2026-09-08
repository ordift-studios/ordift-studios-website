"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { setRepresentationStatus, setPublicationStatus, createTalentCategory, assignTalentCategory, removeTalentCategory } from "@/lib/talent/talentProfiles";
import { setTalentMeasurements } from "@/lib/talent/talentMeasurementsEngine";
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

export async function createTalentCategoryAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const result = await createTalentCategory({ slug, name, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create talent category", result.error);
  revalidatePath("/admin/talent");
}

export async function assignTalentCategoryAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const profileId = String(formData.get("profileId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!profileId || !categoryId) return;

  const result = await assignTalentCategory({ profileId, categoryId, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to assign talent category", result.error);
  revalidatePath(`/admin/talent/${profileId}`);
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
