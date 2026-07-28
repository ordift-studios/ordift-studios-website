"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    throw new Error("Only a Super Admin can manage Member Number classifications.");
  }
  return user;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Creates a new classification — this is the ONLY place starting_number
// is ever set; it has no meaning after creation (numbers may already
// have been issued), so it's deliberately not part of
// updateClassificationAction below.
export async function addClassificationAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();
  const numberPadding = Number(formData.get("numberPadding") ?? 4) || 4;
  const startingNumber = Number(formData.get("startingNumber") ?? 1) || 1;
  if (!name) return { error: "Name is required." };
  if (numberPadding < 1 || numberPadding > 10) return { error: "Digit padding must be between 1 and 10." };
  if (startingNumber < 1) return { error: "Starting number must be at least 1." };

  const admin = createAdminClient();
  const { error } = await admin.from("member_number_classifications").insert({
    slug: slugify(name),
    name,
    prefix,
    number_padding: numberPadding,
    starting_number: startingNumber,
    sort_order: 500,
  });
  if (error) {
    console.error("[admin] failed to add classification", error.message);
    return { error: error.message.includes("duplicate") ? "That name or prefix is already in use." : "Failed to create the classification." };
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "member_number_classification.add",
    entityType: "member_number_classifications",
    metadata: { name, prefix, numberPadding, startingNumber },
  });

  revalidatePath("/admin/lookups");
  return {};
}

// Name/prefix/padding only — see header note on why starting_number
// isn't editable here. Prefix/padding changes only affect numbers
// generated after the edit; anything already issued keeps its literal
// stored formatted_number unchanged.
export async function updateClassificationAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireSuperAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();
  const numberPadding = Number(formData.get("numberPadding") ?? 4) || 4;
  if (!id || !name) return { error: "Name is required." };
  if (numberPadding < 1 || numberPadding > 10) return { error: "Digit padding must be between 1 and 10." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("member_number_classifications")
    .update({ name, prefix, number_padding: numberPadding })
    .eq("id", id);
  if (error) {
    console.error("[admin] failed to update classification", error.message);
    return { error: error.message.includes("duplicate") ? "That name or prefix is already in use." : "Failed to save changes." };
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "member_number_classification.update",
    entityType: "member_number_classifications",
    entityId: id,
    metadata: { name, prefix, numberPadding },
  });

  revalidatePath("/admin/lookups");
  return {};
}

// Disabling blocks new numbers from being generated under this
// classification (see assignClassification() in
// src/lib/portal/memberNumbers.ts) — it never touches anyone who
// already has a number under it.
export async function toggleClassificationAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const admin = createAdminClient();
  const { error } = await admin.from("member_number_classifications").update({ active: !active }).eq("id", id);
  if (error) {
    console.error("[admin] failed to toggle classification", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "member_number_classification.toggle",
      entityType: "member_number_classifications",
      entityId: id,
      metadata: { active: !active },
    });
  }

  revalidatePath("/admin/lookups");
}
