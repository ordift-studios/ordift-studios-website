"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/portal/roles";
import { acknowledgeStandards } from "@/lib/instructors/standards";

export type StandardsAckState = { ok: true } | { ok: false; error: string } | null;

// Self-service only: the person is always the SESSION user (never a form field). The library re-checks that they are an independent instructor, that the version is the adopted one and that the hash matches.
export async function acknowledgeInstructorStandardsAction(_prev: StandardsAckState, f: FormData): Promise<StandardsAckState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const r = await acknowledgeStandards({ profileId: user.id, versionId: String(f.get("versionId") ?? ""), presentedSha256: String(f.get("sha256") ?? ""), typedFullName: String(f.get("typedFullName") ?? ""), consent: f.get("consent") === "yes", ipAddress: ip, userAgent: h.get("user-agent") });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/portal/instructor");
    return { ok: true };
  } catch (error) {
    console.error("[instructor standards] acknowledgement failed", error);
    return { ok: false, error: "Something went wrong and nothing was recorded. Please try again." };
  }
}
