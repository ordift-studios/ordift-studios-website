"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { transitionPulseArticle, type PulseArticleAction } from "@/lib/content/sanity/pulseAdmin";
import { logActivity } from "@/lib/admin/activityLog";

async function requirePulseAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export type TransitionState = { ok: boolean; error?: string } | null;

export async function transitionPulseArticleAction(_prevState: TransitionState, formData: FormData): Promise<TransitionState> {
  try {
    const user = await requirePulseAdmin();
    const articleId = String(formData.get("articleId") ?? "");
    const action = String(formData.get("action") ?? "") as PulseArticleAction;
    if (!articleId || !["publish", "reject", "archive", "restore"].includes(action)) {
      return { ok: false, error: "Invalid request." };
    }

    const result = await transitionPulseArticle(articleId, action);
    if (!result.ok) return { ok: false, error: result.error };

    await logActivity({
      actorUserId: user.id,
      action: `pulse.article_${action}`,
      entityType: "pulseArticle",
      entityId: articleId,
    });

    revalidatePath(`/admin/pulse/${articleId}`);
    revalidatePath("/admin/pulse");
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}
