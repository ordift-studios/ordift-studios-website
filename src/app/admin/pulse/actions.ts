"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { transitionPulseArticle, type PulseArticleAction } from "@/lib/content/sanity/pulseAdmin";
import { logActivity } from "@/lib/admin/activityLog";

// Controlled Test #6E diagnostic instrumentation (2026-09-03) — added
// solely to close an observability gap found during Controlled Test #6D:
// this action's outer catch previously collapsed every possible failure
// (a genuine auth denial, a stale session, or an unrelated bug) into the
// same generic browser-facing message, with zero server-side trace of
// which one occurred. The stage markers below are stdout/stderr only —
// never returned to the browser, never containing tokens/cookies/session
// material, only a per-invocation correlation id, the resolved user's
// UUID (already stored in plaintext in activity_log.actor_user_id
// elsewhere in this same system), and boolean/stage outcomes. The
// authorization CONTROL FLOW is byte-for-byte unchanged: the same two
// conditions throw, the same outer catch converts any throw into the
// same "You are not authorized to do this." response — only the
// internal (server-log-only) exception text differs, so this is purely
// additive visibility, not a behavior change. Remove once #6D's root
// cause is confirmed and resolved, or fold into a permanent structured
// log if it proves broadly useful.
async function requirePulseAdmin(correlationId: string) {
  const user = await getCurrentUser();
  console.log(`[pulse.transition ${correlationId}] getCurrentUser resolved: ${user ? `userId=${user.id}` : "null (no session)"}`);
  if (!user) {
    throw new Error("Not authorized: no session.");
  }
  const isAdmin = hasRole(user, "admin");
  const isSuper = isSuperAdmin(user);
  console.log(`[pulse.transition ${correlationId}] role check: admin=${isAdmin} superAdmin=${isSuper}`);
  if (!isAdmin && !isSuper) {
    throw new Error("Not authorized: insufficient role.");
  }
  console.log(`[pulse.transition ${correlationId}] requirePulseAdmin passed`);
  return user;
}

export type TransitionState = { ok: boolean; error?: string } | null;

export async function transitionPulseArticleAction(_prevState: TransitionState, formData: FormData): Promise<TransitionState> {
  const correlationId = crypto.randomUUID();
  console.log(`[pulse.transition ${correlationId}] server action entered`);
  try {
    const user = await requirePulseAdmin(correlationId);
    const articleId = String(formData.get("articleId") ?? "");
    const action = String(formData.get("action") ?? "") as PulseArticleAction;
    if (!articleId || !["publish", "reject", "archive", "restore"].includes(action)) {
      console.log(`[pulse.transition ${correlationId}] invalid request: articleId=${articleId || "(empty)"} action=${action || "(empty)"}`);
      return { ok: false, error: "Invalid request." };
    }

    console.log(`[pulse.transition ${correlationId}] calling transitionPulseArticle articleId=${articleId} action=${action}`);
    const result = await transitionPulseArticle(articleId, action);
    if (!result.ok) {
      console.log(`[pulse.transition ${correlationId}] transitionPulseArticle returned failure: ${result.error}`);
      return { ok: false, error: result.error };
    }
    console.log(`[pulse.transition ${correlationId}] transitionPulseArticle succeeded`);

    await logActivity({
      actorUserId: user.id,
      action: `pulse.article_${action}`,
      entityType: "pulseArticle",
      entityId: articleId,
    });
    console.log(`[pulse.transition ${correlationId}] activity logged`);

    revalidatePath(`/admin/pulse/${articleId}`);
    revalidatePath("/admin/pulse");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[pulse.transition ${correlationId}] caught exception: ${message}`);
    return { ok: false, error: "You are not authorized to do this." };
  }
}
