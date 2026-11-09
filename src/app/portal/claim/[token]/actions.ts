"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { attemptClaim } from "@/lib/portal/claimService";

export type ClaimFormState = { error: string | null };

// The client, signed in as THEMSELVES, presents the link (a hidden field) and the code they were given. Success sends them to the project's payments page; every other outcome returns a plain message that says
// nothing about whether the project exists.
export async function claimProjectAction(_prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  const token = String(formData.get("token") ?? "");
  const r = await attemptClaim({ claimerUserId: user.id, token, codeInput: String(formData.get("code") ?? "") });
  if (r.ok && r.enquiryId) redirect(`/portal/client/projects/enquiry/${r.enquiryId}/payments`);
  return { error: r.message };
}
