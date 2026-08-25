import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import {
  generateCorporateEmailCandidates,
  pickAvailableLocalPart,
  formatCorporateEmail,
  ORDIFT_STAFF_EMAIL_DOMAIN,
  type CorporateEmailNameInput,
} from "@/lib/organization/corporateEmail";
import { isSuperAdminId, hasAuthority, IDENTITY_CAPABILITIES } from "@/lib/organization/authority";

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
  };
}

export async function listCorporateIdentities(): Promise<CorporateIdentity[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("corporate_identities")
    .select("id, profile_id, email, local_part, domain, status, provider, external_mailbox_id, reserved_at")
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
