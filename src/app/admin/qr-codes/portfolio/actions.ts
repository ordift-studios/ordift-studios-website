"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageConnectPortfolio } from "@/lib/connectPortfolio/permissions";
import { recordAudit } from "@/lib/connectPortfolio/audit";
import { parseOperationInput } from "@/lib/connectPortfolio/input";
import { CACHE_TAG, DOC_ID, fail, type Failure } from "@/lib/connectPortfolio/model";
import { applyChange, discardDraft, loadState, publishDraft, restoreRevision } from "@/lib/connectPortfolio/service";
import { defaultSnapshotStore } from "@/lib/connectPortfolio/snapshot";
import type { ManagerView } from "@/lib/connectPortfolio/view";
import { defaultDeps, viewFor } from "./loadView";

// Every function here is a server action that anyone with the page's script could call, so each one checks the Super Admin itself, on the server, before anything else happens. The page showing
// or hiding a button is never the security boundary.
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !canManageConnectPortfolio(user)) throw new Error("Not authorized.");
  return user;
}

export type ActionResult = { ok: true; view: ManagerView; message: string; warnings: string[] } | Failure;

const BAD_REQUEST = fail("invalid", "That request was not understood.");

/** One editing step on the pending changes. Never changes what visitors see. */
export async function changeDraftAction(expectedRev: string | null, rawOperation: unknown): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const op = parseOperationInput(rawOperation);
  if (!op || (expectedRev !== null && typeof expectedRev !== "string")) return BAD_REQUEST;
  const deps = defaultDeps();
  const result = await applyChange(deps, { userId: user.id, expectedRev, op });
  if (!result.ok) return result;
  const warnings: string[] = [];
  if (!(await recordAudit({ actorUserId: user.id, action: "qr_portfolio.draft_changed", entityId: DOC_ID, metadata: { operation: op.type, key: "key" in op ? op.key : undefined } }))) warnings.push("The change was saved, but its audit entry could not be recorded.");
  return { ok: true, view: await viewFor(result.state, deps), message: "Saved to the pending changes. Visitors still see the published version.", warnings };
}

export async function discardDraftAction(expectedRev: string | null): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  if (expectedRev !== null && typeof expectedRev !== "string") return BAD_REQUEST;
  const deps = defaultDeps();
  const result = await discardDraft(deps, { userId: user.id, expectedRev });
  if (!result.ok) return result;
  const warnings: string[] = [];
  if (!(await recordAudit({ actorUserId: user.id, action: "qr_portfolio.draft_discarded", entityId: DOC_ID }))) warnings.push("The pending changes were discarded, but the audit entry could not be recorded.");
  return { ok: true, view: await viewFor(result.state, deps), message: "Pending changes discarded.", warnings };
}

/**
 * Publishes the pending changes. The list, its history entry and the removal of the draft are one atomic step; if that fails nothing is published and the person is told so. Only after it succeeds are
 * the card page's cache expired and the audit entry written, and a failure in either is reported as a warning (the publish itself stands) rather than hidden or turned into a false "failed".
 */
export async function publishAction(expectedRev: string | null, note: unknown): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  if ((expectedRev !== null && typeof expectedRev !== "string") || (note !== null && note !== undefined && typeof note !== "string")) return BAD_REQUEST;
  const deps = defaultDeps();
  const result = await publishDraft(deps, { userId: user.id, expectedRev, note: typeof note === "string" ? note : null });
  if (!result.ok) return result;

  const warnings: string[] = [];
  try {
    updateTag(CACHE_TAG);                                      // expire the card page's cached list now, so the next scan reads the new one
    revalidatePath("/connect");
    revalidatePath("/admin/qr-codes/portfolio");
  } catch (e) {
    console.error("[qr-portfolio] cache refresh failed after publishing", e instanceof Error ? e.message : e);
    warnings.push("Published, but the card page's cache could not be refreshed immediately. The change will appear within 5 minutes.");
  }
  // The outage record is updated at the moment of publishing, so an outage right after a publish still shows the new list (and never an older one).
  try { await defaultSnapshotStore.write({ v: 1, kind: "published", items: result.publishedItems }); }
  catch (e) {
    console.error("[qr-portfolio] could not record the last good list after publishing", e instanceof Error ? e.message : e);
    warnings.push("Published, but the outage-protection copy could not be saved yet. It is saved automatically on the next visit to the card page.");
  }
  if (!(await recordAudit({ actorUserId: user.id, action: "qr_portfolio.published", entityId: DOC_ID, metadata: { revisionId: result.revisionId, visiblePhotographs: result.visibleCount } }))) {
    warnings.push("Published, but the audit entry could not be recorded. The history entry below is complete.");
  }
  // A failed refresh of the screen after a successful publish must not turn the publish into an error.
  let view: ManagerView | null = null;
  try { view = await viewFor(await loadState(deps), deps); } catch { warnings.push("Published. The screen could not be refreshed; reload the page."); }
  if (!view) return { ok: false, code: "unavailable", message: `Published. ${warnings.join(" ")}` };
  return { ok: true, view, message: `Published. The card page now shows ${result.visibleCount} photographs.`, warnings };
}

/** Puts an earlier version into the pending changes. Nothing goes live until it is published. */
export async function restoreRevisionAction(revisionId: unknown, expectedRev: string | null): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  if (typeof revisionId !== "string" || revisionId.length > 120 || (expectedRev !== null && typeof expectedRev !== "string")) return BAD_REQUEST;
  const deps = defaultDeps();
  const result = await restoreRevision(deps, { userId: user.id, revisionId, expectedRev });
  if (!result.ok) return result;
  const warnings: string[] = [];
  if (!(await recordAudit({ actorUserId: user.id, action: "qr_portfolio.restored_to_draft", entityId: DOC_ID, metadata: { revisionId } }))) warnings.push("The version was restored to the pending changes, but the audit entry could not be recorded.");
  return { ok: true, view: await viewFor(result.state, deps), message: "That version is now in the pending changes. Review it, then publish.", warnings };
}
