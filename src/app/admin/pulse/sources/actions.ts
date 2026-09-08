"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { updatePulseSourceAdmin, createPulseSourceAdmin, checkPulseSourcePolicy, type PulsePolicyCheckResult } from "@/lib/content/sanity/pulseAdmin";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/admin/activityLog";
import { editorialClient } from "@/sanity/lib/client";
import { runDiscoveryForSource, type RunDiscoveryResult } from "@/lib/pulse/ingestion";
import type { PulseEditorialTrustLevel, PulsePermissionClassification, PulseSourceClassification } from "@/lib/content/types";

async function requirePulseAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export type UpdateSourceState = { ok: boolean; error?: string } | null;

export async function updatePulseSourceAction(_prevState: UpdateSourceState, formData: FormData): Promise<UpdateSourceState> {
  try {
    const user = await requirePulseAdmin();
    const sourceId = String(formData.get("sourceId") ?? "");
    if (!sourceId) return { ok: false, error: "Invalid request." };

    const attributionRequirement = String(formData.get("attributionRequirement") ?? "").trim();
    const lastPolicyReviewDate = String(formData.get("lastPolicyReviewDate") ?? "").trim();
    const termsUrl = String(formData.get("termsUrl") ?? "").trim();
    const licenseNotes = String(formData.get("licenseNotes") ?? "").trim();
    const freshnessWindowDaysOverrideRaw = String(formData.get("freshnessWindowDaysOverride") ?? "").trim();
    const freshnessWindowDaysOverride = freshnessWindowDaysOverrideRaw ? Number(freshnessWindowDaysOverrideRaw) : null;
    if (freshnessWindowDaysOverrideRaw && (!Number.isFinite(freshnessWindowDaysOverride) || freshnessWindowDaysOverride === null)) {
      return { ok: false, error: "Freshness Window Override must be a number." };
    }

    const result = await updatePulseSourceAdmin(sourceId, {
      isActive: formData.get("isActive") === "on",
      permissionClassification: String(formData.get("permissionClassification") ?? "unknown") as PulsePermissionClassification,
      editorialTrustLevel: String(formData.get("editorialTrustLevel") ?? "unverified") as PulseEditorialTrustLevel,
      imageUsePermitted: formData.get("imageUsePermitted") === "on",
      commercialUsePermitted: formData.get("commercialUsePermitted") === "on",
      autoPublishEligible: formData.get("autoPublishEligible") === "on",
      attributionRequirement: attributionRequirement || null,
      lastPolicyReviewDate: lastPolicyReviewDate || null,
      sourceClassification: String(formData.get("sourceClassification") ?? "editorial_discovery") as PulseSourceClassification,
      termsUrl: termsUrl || null,
      licenseNotes: licenseNotes || null,
      freshnessWindowDaysOverride,
    });
    if (!result.ok) return { ok: false, error: result.error };

    await logActivity({
      actorUserId: user.id,
      action: "pulse.source_updated",
      entityType: "pulseSource",
      entityId: sourceId,
    });

    revalidatePath(`/admin/pulse/sources/${sourceId}`);
    revalidatePath("/admin/pulse/sources");
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Adaptive Discovery Remediation, Part 3 (2026-09-08) — the Admin/
// Super Admin manual "Run Discovery" control. Calls the exact same
// runDiscoveryForSource() the cron route (Part 2) and the existing
// /api/admin/pulse/run-discovery HTTP route both call — nothing here
// duplicates discovery logic, only re-exposes the identical pipeline as
// a server action so the button can use this codebase's established
// useActionState pattern (ArticleActions.tsx) instead of a client-side
// fetch(). Never throws — every failure path (auth, refusal, per-item
// errors) returns a normal state the button can render truthfully.
export type RunDiscoveryState = { ok: boolean; error?: string; result?: RunDiscoveryResult } | null;

export async function runPulseDiscoveryAction(_prevState: RunDiscoveryState, formData: FormData): Promise<RunDiscoveryState> {
  try {
    const user = await requirePulseAdmin();
    const sourceId = String(formData.get("sourceId") ?? "");
    if (!sourceId) return { ok: false, error: "Invalid request." };

    const result = await runDiscoveryForSource(
      sourceId,
      editorialClient,
      async (summary) => {
        await logActivity({
          actorUserId: user.id,
          action: "pulse.discovery_run",
          entityType: "pulseSource",
          entityId: summary.sourceId,
          metadata: { ...summary, trigger: "manual" },
        });
      },
      async (started) => {
        await logActivity({
          actorUserId: user.id,
          action: "pulse.discovery_run_started",
          entityType: "pulseSource",
          entityId: started.sourceId,
          metadata: { ...started, trigger: "manual" },
        });
      }
    );

    if (result.refused) {
      return { ok: false, error: result.refused, result };
    }
    if (result.errors.length > 0) {
      return { ok: false, error: result.errors.join(" "), result };
    }

    revalidatePath("/admin/pulse");
    revalidatePath("/admin/pulse/sources");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Manual Source Addition, Part N (2026-09-08).
export type CreateSourceState = { ok: boolean; error?: string } | null;

export async function createPulseSourceAction(_prevState: CreateSourceState, formData: FormData): Promise<CreateSourceState> {
  const user = await requirePulseAdmin().catch(() => null);
  if (!user) return { ok: false, error: "You are not authorized to do this." };

  const name = String(formData.get("name") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "manual");
  const url = String(formData.get("url") ?? "").trim();
  const feedUrl = String(formData.get("feedUrl") ?? "").trim();
  const termsUrl = String(formData.get("termsUrl") ?? "").trim();
  const sourceClassification = String(formData.get("sourceClassification") ?? "editorial_discovery") as PulseSourceClassification;

  const result = await createPulseSourceAdmin({
    name,
    sourceType,
    url: url || null,
    feedUrl: feedUrl || null,
    termsUrl: termsUrl || null,
    sourceClassification,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await logActivity({ actorUserId: user.id, action: "pulse.source_created", entityType: "pulseSource", entityId: result.id, metadata: { name, sourceType } });

  revalidatePath("/admin/pulse/sources");
  redirect(`/admin/pulse/sources/${result.id}`);
}

// Rights Intelligence, "Check Policy" (2026-09-08) — the one-shot
// evidence/recommendation action. Same admin gate as every other Source
// Manager action; checkPulseSourcePolicy() itself is what guarantees
// this can never write permissionClassification/isActive/
// imageUsePermitted/commercialUsePermitted/autoPublishEligible/
// editorialTrustLevel/attributionRequirement/lastPolicyReviewDate — see
// its own comment and policyEvidence.test.ts.
export type CheckPolicyState = { ok: boolean; error?: string; result?: PulsePolicyCheckResult } | null;

export async function checkPulseSourcePolicyAction(_prevState: CheckPolicyState, formData: FormData): Promise<CheckPolicyState> {
  try {
    const user = await requirePulseAdmin();
    const sourceId = String(formData.get("sourceId") ?? "");
    if (!sourceId) return { ok: false, error: "Invalid request." };

    const result = await checkPulseSourcePolicy(sourceId);
    if (!result.ok) return { ok: false, error: result.error, result };

    await logActivity({
      actorUserId: user.id,
      action: "pulse.source_policy_checked",
      entityType: "pulseSource",
      entityId: sourceId,
      metadata: { recommendation: result.recommendation, checkedUrl: result.checkedUrl },
    });

    revalidatePath(`/admin/pulse/sources/${sourceId}`);
    return { ok: true, result };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}
