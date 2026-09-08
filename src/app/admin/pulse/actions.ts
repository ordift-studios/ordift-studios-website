"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { transitionPulseArticle, setPulseArticleHeroMedia, clearPulseArticleHeroMedia, type PulseArticleAction } from "@/lib/content/sanity/pulseAdmin";
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

// Adaptive Discovery Remediation, Part 6 (2026-09-08) — the missing
// hero-media editorial control. Both actions patch ONLY the heroMedia
// field (setPulseArticleHeroMedia()/clearPulseArticleHeroMedia() in
// pulseAdmin.ts) — never status, tags, or anything publish-readiness
// also checks, so setting/clearing hero media can never itself change
// whether an article is published.
async function requirePulseAdminSimple() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export type HeroMediaState = { ok: boolean; error?: string } | null;

export async function setPulseArticleHeroMediaAction(_prevState: HeroMediaState, formData: FormData): Promise<HeroMediaState> {
  try {
    const user = await requirePulseAdminSimple();
    const articleId = String(formData.get("articleId") ?? "");
    const mediaType = String(formData.get("mediaType") ?? "");
    const alt = String(formData.get("alt") ?? "").trim();
    if (!articleId || !alt) return { ok: false, error: "Alt text is required." };

    let result: { ok: true } | { ok: false; error: string };
    if (mediaType === "image") {
      const assetId = String(formData.get("assetId") ?? "");
      if (!assetId) return { ok: false, error: "No uploaded image to attach — upload one first." };
      result = await setPulseArticleHeroMedia(articleId, { type: "image", assetId, alt });
    } else if (mediaType === "embed") {
      const url = String(formData.get("embedUrl") ?? "").trim();
      if (!url) return { ok: false, error: "Embed URL is required." };
      try {
        new URL(url);
      } catch {
        return { ok: false, error: "That embed URL doesn't look valid." };
      }
      result = await setPulseArticleHeroMedia(articleId, { type: "embed", url, alt });
    } else {
      return { ok: false, error: "Invalid request." };
    }

    if (!result.ok) return { ok: false, error: result.error };

    await logActivity({ actorUserId: user.id, action: "pulse.hero_media_set", entityType: "pulseArticle", entityId: articleId, metadata: { mediaType } });
    revalidatePath(`/admin/pulse/${articleId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export async function clearPulseArticleHeroMediaAction(_prevState: HeroMediaState, formData: FormData): Promise<HeroMediaState> {
  try {
    const user = await requirePulseAdminSimple();
    const articleId = String(formData.get("articleId") ?? "");
    if (!articleId) return { ok: false, error: "Invalid request." };

    const result = await clearPulseArticleHeroMedia(articleId);
    if (!result.ok) return { ok: false, error: result.error };

    await logActivity({ actorUserId: user.id, action: "pulse.hero_media_cleared", entityType: "pulseArticle", entityId: articleId });
    revalidatePath(`/admin/pulse/${articleId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}
