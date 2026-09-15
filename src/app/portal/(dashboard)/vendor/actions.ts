"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { uploadVendorDocument } from "@/lib/vendors/vendorDocuments";

export type ActionState = { ok: boolean; error?: string } | null;

// Self-service upload — deliberately separate from the admin-side
// uploadVendorDocumentAction (admin/organization/vendors/[vendorId]/actions.ts),
// which is gated to canManageOnboarding only. This action is reachable
// only by the vendor acting on their OWN profile — the underlying
// uploadVendorDocument() (vendorDocuments.ts) independently re-checks
// that regardless (actorUserId === vendorProfileId), but this action
// never even accepts a different vendorId as a parameter, matching
// this codebase's established "self-service action never takes
// someone else's id from the form" convention (e.g.
// acknowledgeOwnPolicyAction, recordOwnFounderEmploymentTermsAction).
export async function uploadOwnVendorDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const documentType = String(formData.get("documentType") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Choose a file to upload." };

  const result = await uploadVendorDocument({ vendorProfileId: user.id, documentType, file, notes, actorUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/portal/vendor");
  return { ok: true };
}
