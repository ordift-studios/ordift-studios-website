import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import {
  canRequestProvisioning,
  canAttemptProvisioning,
  resolveProvisioningOutcomeStatus,
  resolveProvisioningExceptionStatus,
  type CorporateIdentityStatus,
} from "@/lib/organization/provisioningLifecycle";
import type { ProvisioningProvider, ProvisioningType } from "@/lib/organization/provisioningProvider";

// Google Workspace Corporate Email, Milestone 1B (2026-09-10) — the
// DB-dependent half of the provisioning foundation. Per this module's
// own design goal, no function here ever constructs a provider itself
// — every real external call happens only inside whatever
// ProvisioningProvider the caller injects (the mock today; a future
// googleWorkspaceProvider.ts later), so this module has zero ability
// to reach Google regardless of how it's called.
//
// Authorization is deliberately Super-Admin-only via isSuperAdminId()
// directly — narrower than reserveCorporateIdentity.ts's own
// requireIdentityCapabilityOrSuperAdmin() (which also lets a
// Technology-capability holder through). Provisioning a real external
// account is a higher-privilege, harder-to-reverse action than
// reserving an internal address, so this milestone holds it to the
// narrower bar on purpose — matching the same "Super Admin only,
// deliberately narrower than the general capability" reasoning already
// applied to this week's correctCorporateIdentityLocalPartAction.

async function requireSuperAdminId(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSuperAdminId(actorUserId)) return { ok: true };
  return { ok: false, error: "Only a Super Admin can manage corporate identity provisioning." };
}

type IdentityRow = { id: string; email: string; status: string; profile_id: string; legal_first_name: string; legal_surname: string };

async function loadIdentity(admin: ReturnType<typeof createAdminClient>, identityId: string): Promise<IdentityRow | null> {
  const { data } = await admin
    .from("corporate_identities")
    .select("id, email, status, profile_id, legal_first_name, legal_surname")
    .eq("id", identityId)
    .maybeSingle();
  return data ?? null;
}

// reserved -> pending_provisioning. Records WHAT KIND of external
// identity is being requested and WHEN — no external call happens
// here at all, this is purely a stated intent, matching
// provisioning_requested_at's own column comment.
export async function requestCorporateIdentityProvisioning(params: {
  identityId: string;
  provisioningType: ProvisioningType;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authCheck = await requireSuperAdminId(params.actorUserId);
  if (!authCheck.ok) return authCheck;

  const admin = createAdminClient();
  const existing = await loadIdentity(admin, params.identityId);
  if (!existing) return { ok: false, error: "Identity not found." };

  if (!canRequestProvisioning(existing.status as CorporateIdentityStatus)) {
    return { ok: false, error: `This identity is "${existing.status}", not "reserved" — provisioning can only be requested for a still-reserved identity.` };
  }

  // Atomic compare-and-swap (the same pattern this codebase already
  // uses for payment_obligations' status-transition guards, TD-053/
  // TD-064) — the WHERE clause itself re-checks status='reserved' at
  // write time, not only at the read above, so two concurrent requests
  // on the same identity can never both succeed.
  const { data: updated, error } = await admin
    .from("corporate_identities")
    .update({ status: "pending_provisioning", provisioning_type: params.provisioningType, provisioning_requested_at: new Date().toISOString(), provisioning_failure_reason: null })
    .eq("id", params.identityId)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[organization] failed to request corporate identity provisioning", error.message);
    return { ok: false, error: "Failed to request provisioning." };
  }
  if (!updated) {
    return { ok: false, error: "This identity is no longer reserved — someone else may have just changed it. Refresh and try again." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "corporate_identity.provisioning_requested",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { email: existing.email, provisioningType: params.provisioningType },
  });

  return { ok: true };
}

// pending_provisioning|provisioning_failed -> active (success) or
// provisioning_failed (anything else, including a thrown exception).
// `provider` is injected by the caller — this function never
// constructs one. No branch of this function can ever reach "active"
// except through resolveProvisioningOutcomeStatus() given a genuine
// ok:true outcome from that provider.
export async function provisionCorporateIdentity(params: {
  identityId: string;
  provider: ProvisioningProvider;
  actorUserId: string;
}): Promise<{ ok: true; externalId: string } | { ok: false; error: string }> {
  const authCheck = await requireSuperAdminId(params.actorUserId);
  if (!authCheck.ok) return authCheck;

  const admin = createAdminClient();
  const existing = await loadIdentity(admin, params.identityId);
  if (!existing) return { ok: false, error: "Identity not found." };

  if (!canAttemptProvisioning(existing.status as CorporateIdentityStatus)) {
    return {
      ok: false,
      error: `This identity is "${existing.status}" — a provisioning attempt can only run from "pending_provisioning" (after a request) or "provisioning_failed" (a retry). If it's already "active", it has already been provisioned.`,
    };
  }

  // Claim the attempt atomically BEFORE calling the provider, by
  // moving to a transient marker state is unnecessary complexity for
  // this milestone's scale — instead, the eventual write below is
  // itself guarded by the same .eq("status", ...) compare-and-swap, so
  // two concurrent attempts can both call the (idempotent-by-design)
  // mock provider, but only one can ever win the write that actually
  // changes the row — the loser's update affects zero rows and is
  // reported as a conflict, never silently double-applied.
  await logActivity({
    actorUserId: params.actorUserId,
    action: "corporate_identity.provisioning_attempted",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { email: existing.email, provider: params.provider.name },
  });

  let newStatus: "active" | "provisioning_failed";
  let externalId: string | null = null;
  let failureReason: string | null = null;

  try {
    const outcome = await params.provider.provision({
      email: existing.email,
      provisioningType: "licensed_mailbox",
      legalFirstName: existing.legal_first_name,
      legalSurname: existing.legal_surname,
    });
    newStatus = resolveProvisioningOutcomeStatus(outcome);
    if (outcome.ok) {
      externalId = outcome.externalId;
    } else {
      failureReason = outcome.reason;
    }
  } catch (e) {
    // A thrown exception (a real provider's network error, or any
    // shape this code didn't anticipate) is treated exactly like a
    // reported failure — never left pending, never promoted to
    // active. The raw exception message is logged server-side only
    // (console.error) — never persisted into failure_reason/metadata,
    // since a future real provider's thrown error could in principle
    // carry sensitive request/response detail this project's standing
    // secret-handling discipline says never to store.
    console.error("[organization] provisioning provider threw", e instanceof Error ? e.message : String(e));
    newStatus = resolveProvisioningExceptionStatus();
    failureReason = "unavailable";
  }

  const { data: updated, error } = await admin
    .from("corporate_identities")
    .update({
      status: newStatus,
      // provider is only ever recorded on a genuine confirmed success
      // (never on failure) — `undefined` here means "omit this field
      // from the update" (matching setCorporateIdentityStatus's own
      // established use of the same pattern in this file), so a
      // failed attempt leaves it exactly as it already was: null,
      // since it can only ever be null before the first success.
      provider: newStatus === "active" ? params.provider.name : undefined,
      external_mailbox_id: externalId,
      provisioned_at: newStatus === "active" ? new Date().toISOString() : null,
      provisioning_failure_reason: failureReason,
    })
    .eq("id", params.identityId)
    .in("status", ["pending_provisioning", "provisioning_failed"])
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[organization] failed to record corporate identity provisioning result", error.message);
    return { ok: false, error: "The provisioning attempt ran, but recording its result failed. Check the identity's status directly before retrying." };
  }
  if (!updated) {
    return { ok: false, error: "This identity's state changed during the attempt — someone else may have acted on it concurrently. Refresh and check its current status before retrying." };
  }

  if (newStatus === "active") {
    await logActivity({
      actorUserId: params.actorUserId,
      action: "corporate_identity.provisioning_confirmed",
      entityType: "user",
      entityId: existing.profile_id,
      metadata: { email: existing.email, provider: params.provider.name, externalId },
    });
    await logActivity({
      actorUserId: params.actorUserId,
      action: "corporate_identity.activated",
      entityType: "user",
      entityId: existing.profile_id,
      metadata: { email: existing.email, provider: params.provider.name },
    });
    return { ok: true, externalId: externalId! };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "corporate_identity.provisioning_failed",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { email: existing.email, provider: params.provider.name, reason: failureReason },
  });
  return { ok: false, error: `Provisioning did not succeed: ${failureReason ?? "unknown reason"}. The identity was not activated — it now requires human review before any retry.` };
}
