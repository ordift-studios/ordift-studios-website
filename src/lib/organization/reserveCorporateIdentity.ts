import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import {
  generateCorporateEmailCandidates,
  pickAvailableLocalPart,
  formatCorporateEmail,
  normalizeRequestedLocalPart,
  ORDIFT_STAFF_EMAIL_DOMAIN,
  type CorporateEmailNameInput,
} from "@/lib/organization/corporateEmail";
import { isSuperAdminId, hasAuthority, IDENTITY_CAPABILITIES } from "@/lib/organization/authority";
import { createDepartmentRequest, decideDepartmentRequest } from "@/lib/organization/departmentRequests";

const STATUS_CAPABILITY: Record<string, string> = {
  suspended: IDENTITY_CAPABILITIES.suspend,
  active: IDENTITY_CAPABILITIES.reactivate,
  deactivated: IDENTITY_CAPABILITIES.deactivate,
  pending_provisioning: IDENTITY_CAPABILITIES.provision,
  provisioning_failed: IDENTITY_CAPABILITIES.provision,
};

async function requireIdentityCapabilityOrSuperAdmin(
  actorUserId: string,
  capability: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSuperAdminId(actorUserId)) return { ok: true };
  const authorized = await hasAuthority(actorUserId, capability, null);
  if (!authorized) return { ok: false, error: "Only Technology (GEEK) or a Super Admin can do this." };
  return { ok: true };
}

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Parts B/C (2026-08-25) — the persistence layer for corporateEmail.ts's
// pure generation logic, against public.corporate_identities. Collision
// detection happens here, against real reserved local_parts, before
// ever writing a row — never provisions an external mailbox (no
// provider integration exists yet; see the Phase 3.3 report).

export type CorporateIdentity = {
  id: string;
  profileId: string;
  email: string;
  localPart: string;
  domain: string;
  status: string;
  provider: string | null;
  externalMailboxId: string | null;
  reservedAt: string;
  // Google Workspace Corporate Email, Milestone 1B (2026-09-10) —
  // added purely so the provisioning Admin UI can show current
  // lifecycle state without a second read; unused by any pre-existing
  // caller of this type.
  provisioningType: string | null;
  provisioningRequestedAt: string | null;
  provisionedAt: string | null;
  provisioningFailureReason: string | null;
};

function mapIdentity(row: {
  id: string;
  profile_id: string;
  email: string;
  local_part: string;
  domain: string;
  status: string;
  provider: string | null;
  external_mailbox_id: string | null;
  reserved_at: string;
  provisioning_type?: string | null;
  provisioning_requested_at?: string | null;
  provisioned_at?: string | null;
  provisioning_failure_reason?: string | null;
}): CorporateIdentity {
  return {
    id: row.id,
    profileId: row.profile_id,
    email: row.email,
    localPart: row.local_part,
    domain: row.domain,
    status: row.status,
    provider: row.provider,
    externalMailboxId: row.external_mailbox_id,
    reservedAt: row.reserved_at,
    provisioningType: row.provisioning_type ?? null,
    provisioningRequestedAt: row.provisioning_requested_at ?? null,
    provisionedAt: row.provisioned_at ?? null,
    provisioningFailureReason: row.provisioning_failure_reason ?? null,
  };
}

export async function listCorporateIdentities(): Promise<CorporateIdentity[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("corporate_identities")
    .select(
      "id, profile_id, email, local_part, domain, status, provider, external_mailbox_id, reserved_at, provisioning_type, provisioning_requested_at, provisioned_at, provisioning_failure_reason"
    )
    .order("reserved_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load corporate_identities", error.message);
    return [];
  }
  return (data ?? []).map(mapIdentity);
}

export type ReserveCorporateIdentityResult =
  | { ok: true; identity: CorporateIdentity }
  | { ok: false; error: string };

// Never reused after deactivation, by construction: this only ever
// checks against local_parts that have EVER been reserved in this
// domain (the unique constraint on corporate_identities has no status
// filter), so a deactivated person's old address can never be handed
// to someone else, even accidentally — exactly satisfied without any
// extra "don't reuse" logic needed here.
// Phase 3.4, Part 7 — the real enforcement point for
// technology.identity.reserve (GEEK's capability).
export async function reserveCorporateIdentity(params: {
  profileId: string;
  name: CorporateEmailNameInput;
  reservedBy: string;
}): Promise<ReserveCorporateIdentityResult> {
  const authCheck = await requireIdentityCapabilityOrSuperAdmin(params.reservedBy, IDENTITY_CAPABILITIES.reserve);
  if (!authCheck.ok) return authCheck;

  const { profileId, name, reservedBy } = params;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("corporate_identities")
    .select("id, profile_id, email, local_part, domain, status, provider, external_mailbox_id, reserved_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: `This person already has a corporate identity: ${existing.email}` };
  }

  const { data: takenRows, error: takenError } = await admin
    .from("corporate_identities")
    .select("local_part")
    .eq("domain", ORDIFT_STAFF_EMAIL_DOMAIN);
  if (takenError) {
    console.error("[organization] failed to check corporate_identities collisions", takenError.message);
    return { ok: false, error: "Failed to check for existing addresses." };
  }
  const taken = new Set((takenRows ?? []).map((r) => r.local_part));

  const candidates = generateCorporateEmailCandidates(name);
  const picked = pickAvailableLocalPart(candidates, (localPart) => taken.has(localPart));
  if (!picked) {
    return { ok: false, error: "Could not generate an available corporate email address — exhausted every candidate." };
  }

  const { data: inserted, error: insertError } = await admin
    .from("corporate_identities")
    .insert({
      profile_id: profileId,
      local_part: picked.localPart,
      domain: ORDIFT_STAFF_EMAIL_DOMAIN,
      legal_first_name: name.firstName,
      legal_middle_names: name.middleNames?.join(" ") || null,
      legal_surname: name.surname,
      additional_verified_names_used: picked.usedAdditionalNames.join(" ") || null,
      status: "reserved",
      reserved_by: reservedBy,
    })
    .select("id, profile_id, email, local_part, domain, status, provider, external_mailbox_id, reserved_at")
    .single();
  if (insertError || !inserted) {
    console.error("[organization] failed to reserve corporate identity", insertError?.message);
    return { ok: false, error: "Failed to reserve the corporate identity." };
  }

  await logActivity({
    actorUserId: reservedBy,
    action: "corporate_identity.reserved",
    entityType: "user",
    entityId: profileId,
    metadata: { email: formatCorporateEmail(picked.localPart), usedFallback: picked.isFallback },
  });

  return { ok: true, identity: mapIdentity(inserted) };
}

// Status transitions only — no external provisioning call exists yet.
// Moving to 'pending_provisioning'/'provisioning_failed' records
// INTENT and internal queue state; moving to 'active' must only ever
// happen once a real external mailbox is confirmed to exist, which no
// code path in this phase can do (see the Phase 3.3 report).
// Phase 3.4, Part 7 — the real enforcement point for
// technology.identity.suspend/reactivate/deactivate/provision (GEEK's
// capability), selected by the target status.
export async function setCorporateIdentityStatus(params: {
  identityId: string;
  status: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const requiredCapability = STATUS_CAPABILITY[params.status] ?? IDENTITY_CAPABILITIES.manageEmail;
  const authCheck = await requireIdentityCapabilityOrSuperAdmin(params.actorUserId, requiredCapability);
  if (!authCheck.ok) return authCheck;

  // Active-state bypass guard (Milestone 1C-A, 2026-09-11) — this
  // generic setter must never be the thing that marks an identity
  // 'active'. Checked after authorization (so an unauthorized caller
  // still gets a plain auth failure, not a hint about this rule) but
  // before any read/write. The only legitimate route to first-time
  // 'active' is provisionCorporateIdentity() (corporateProvisioning.ts)
  // — reserved -> explicit request -> pending_provisioning -> explicit
  // attempt -> a genuine provider-confirmed success, gated end-to-end
  // by provisioningLifecycle.ts's resolveProvisioningOutcomeStatus().
  // A future "restore a previously-provisioned identity to active"
  // reactivation workflow is real and anticipated (STATUS_CAPABILITY
  // above already names IDENTITY_CAPABILITIES.reactivate for exactly
  // this) — but per explicit instruction it is not built here; when it
  // is, it needs its own validated path (e.g. requiring
  // external_mailbox_id/provider to already be set, proving this
  // identity really was provisioned before), not a re-opened gap in
  // this generic setter.
  if (params.status === "active") {
    return {
      ok: false,
      error:
        "This generic status setter can never set 'active' directly — use the provisioning workflow (request, then an explicit provisioning attempt) for first-time activation. Restoring a previously-provisioned identity to active is not yet implemented.",
    };
  }

  const admin = createAdminClient();
  const { data: previous } = await admin.from("corporate_identities").select("profile_id, status").eq("id", params.identityId).maybeSingle();
  if (!previous) return { ok: false, error: "Identity not found." };

  const { error } = await admin
    .from("corporate_identities")
    .update({
      status: params.status,
      deactivated_at: params.status === "deactivated" ? new Date().toISOString() : undefined,
    })
    .eq("id", params.identityId);
  if (error) {
    console.error("[organization] failed to update corporate identity status", error.message);
    return { ok: false, error: "Failed to update status." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "corporate_identity.status_changed",
    entityType: "user",
    entityId: previous.profile_id,
    metadata: { previousStatus: previous.status, newStatus: params.status },
  });

  return { ok: true };
}

// ============================================================
// Work-email request/approval diff trail (2026-09-07)
// ============================================================
// The reserve act above already IS the approval act (only Technology/
// GEEK or Super Admin can call it). These two functions add the
// explicit "requester proposed X, approver approved Y, here is the
// difference" trail for the case where the PERSON asks for a specific
// alternative local part before the system-generated one is finalized.
// Reuses the existing generic department_requests workflow
// (request_type = 'work_email_alternative_request') rather than a new
// table — the request itself carries zero authority; only
// approveCorporateIdentityLocalPart() below can actually change the
// reserved address, and it re-runs the exact same uniqueness check as
// the original reservation.
export async function requestCorporateIdentityLocalPart(params: {
  profileId: string;
  requestedLocalPart: string;
  requestedBy: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const validation = normalizeRequestedLocalPart(params.requestedLocalPart);
  if (!validation.ok) return validation;
  const normalized = validation.value;

  const result = await createDepartmentRequest({
    requestType: "work_email_alternative_request",
    title: `Work email alternative request: ${normalized}@${ORDIFT_STAFF_EMAIL_DOMAIN}`,
    description: "Requested local part must still be based on the names genuinely submitted in onboarding — final selection requires Technology/GEEK or Super Admin approval.",
    payload: { profileId: params.profileId, requestedLocalPart: normalized },
    requestedBy: params.requestedBy,
  });
  if (!result.ok) return result;

  await logActivity({
    actorUserId: params.requestedBy,
    action: "corporate_identity.local_part_requested",
    entityType: "user",
    entityId: params.profileId,
    metadata: { requestedLocalPart: normalized, requestId: result.requestId },
  });

  return { ok: true, requestId: result.requestId };
}

// Diff-tracked approval: records both the requested and the actually-
// approved local part (they may differ — an admin can approve a
// different, still name-derived candidate instead, e.g. because the
// requested one collided). Never silently modifies the address without
// this being visible: requested_local_part/approved_by/approved_at/
// approval_reason are all persisted on the corporate_identities row.
export async function approveCorporateIdentityLocalPart(params: {
  identityId: string;
  requestId?: string | null;
  requestedLocalPart: string;
  approvedLocalPart: string;
  approvalReason?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authCheck = await requireIdentityCapabilityOrSuperAdmin(params.actorUserId, IDENTITY_CAPABILITIES.manageEmail);
  if (!authCheck.ok) return authCheck;

  const approvedLocalPart = params.approvedLocalPart.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("corporate_identities")
    .select("id, profile_id, local_part, domain, status")
    .eq("id", params.identityId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Identity not found." };

  // Reserved-only guard (2026-09-10) — the address of a corporate
  // identity may only ever be corrected while it is still in the
  // initial 'reserved' (never-provisioned) state. No external
  // mailbox-provisioning integration exists anywhere in this codebase
  // today (see setCorporateIdentityStatus's own comment above — no
  // code path can move a row to 'active' from a real confirmed
  // mailbox), so this is a forward-looking safeguard, not a reaction
  // to any real provisioned row existing yet: once a status other than
  // 'reserved' is ever reached (pending_provisioning/provisioning_failed/
  // active/suspended/deactivated), the address is no longer a simple
  // typo-fix candidate — a controlled mailbox/alias migration is the
  // correct path instead. Applies to every caller of this function,
  // not just the direct Super-Admin correction UI — the request/
  // approval diff-trail workflow (above) should not bypass this either.
  if (existing.status !== "reserved") {
    return {
      ok: false,
      error: `This corporate identity is "${existing.status}", not "reserved" — its address can no longer be corrected through this workflow. A provisioned or externally-bound identity requires a controlled mailbox/alias migration, not a direct correction.`,
    };
  }

  if (approvedLocalPart !== existing.local_part) {
    const { data: takenRows, error: takenError } = await admin
      .from("corporate_identities")
      .select("id")
      .eq("domain", existing.domain)
      .eq("local_part", approvedLocalPart)
      .neq("id", params.identityId);
    if (takenError) {
      console.error("[organization] failed to check local part uniqueness", takenError.message);
      return { ok: false, error: "Failed to verify the address is available." };
    }
    if (takenRows && takenRows.length > 0) {
      return { ok: false, error: `${approvedLocalPart}@${existing.domain} is already reserved by another person.` };
    }
  }

  const { error } = await admin
    .from("corporate_identities")
    .update({
      local_part: approvedLocalPart,
      requested_local_part: params.requestedLocalPart,
      approved_by: params.actorUserId,
      approved_at: new Date().toISOString(),
      approval_reason: params.approvalReason ?? null,
    })
    .eq("id", params.identityId);
  if (error) {
    console.error("[organization] failed to approve corporate identity local part", error.message);
    return { ok: false, error: "Failed to record the approval." };
  }

  if (params.requestId) {
    await decideDepartmentRequest({
      requestId: params.requestId,
      decision: "approved",
      decisionNotes: approvedLocalPart !== params.requestedLocalPart
        ? `Approved as ${approvedLocalPart} instead of requested ${params.requestedLocalPart}.`
        : "Approved as requested.",
      actorUserId: params.actorUserId,
    });
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "corporate_identity.local_part_approved",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { requestedLocalPart: params.requestedLocalPart, approvedLocalPart, changed: approvedLocalPart !== params.requestedLocalPart },
  });

  return { ok: true };
}
