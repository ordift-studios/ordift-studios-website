import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { Proficiency, VerificationStatus } from "./config";

// Capability management for Crew Support matching. Callers MUST have
// checked canManageCrewSupport(). Capabilities are editable at any time
// (nothing is hard-coded per person, including the Founder), every change
// is attributed, and a revoked capability is kept for history.

const WORKFORCE_ROLES = ["staff", "admin", "super_admin", "vendor", "contractor", "model"];

export type CapabilityRow = { id: string; titleId: string; titleName: string; proficiency: Proficiency; verification: VerificationStatus; source: string; notes: string | null };
export type CapabilityPerson = { profileId: string; name: string; memberNumber: string | null; roles: string[]; engagementType: string | null; capabilities: CapabilityRow[] };

export async function listCapabilityTitles(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient().from("operational_titles").select("id, name").eq("active", true).order("sort_order");
  return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }));
}

export async function listCapabilityPeople(): Promise<CapabilityPerson[]> {
  const admin = createAdminClient();
  const { data: roleRows } = await admin.from("roles").select("id, slug").in("slug", WORKFORCE_ROLES);
  const roleIds = (roleRows ?? []).map((r) => r.id as string);
  const slugById = new Map((roleRows ?? []).map((r) => [r.id as string, r.slug as string]));
  const [{ data: links }, { data: caps }] = await Promise.all([
    roleIds.length ? admin.from("user_roles").select("user_id, role_id").in("role_id", roleIds) : Promise.resolve({ data: [] as { user_id: string; role_id: string }[] }),
    admin.from("person_capabilities").select("id, profile_id, operational_title_id, proficiency, verification_status, source, notes, title:operational_titles(name)").order("created_at"),
  ]);
  const rolesByUser = new Map<string, string[]>();
  for (const l of links ?? []) rolesByUser.set(l.user_id as string, [...(rolesByUser.get(l.user_id as string) ?? []), slugById.get(l.role_id as string) ?? ""]);
  const ids = [...new Set([...rolesByUser.keys(), ...(caps ?? []).map((c) => c.profile_id as string)])];
  if (!ids.length) return [];
  const [{ data: profiles }, { data: staff }] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number").in("id", ids),
    admin.from("staff_details").select("id, engagement_type:engagement_types(name)").in("id", ids),
  ]);
  const engagement = new Map((staff ?? []).map((s) => [s.id as string, ((s.engagement_type as unknown as { name: string } | null)?.name) ?? null]));
  return (profiles ?? [])
    .map((p) => ({
      profileId: p.id as string,
      name: (p.full_name as string | null) ?? "Unnamed profile",
      memberNumber: (p.member_number as string | null) ?? null,
      roles: rolesByUser.get(p.id as string) ?? [],
      engagementType: engagement.get(p.id as string) ?? null,
      capabilities: (caps ?? [])
        .filter((c) => c.profile_id === p.id)
        .map((c) => ({
          id: c.id as string,
          titleId: c.operational_title_id as string,
          titleName: ((c.title as unknown as { name: string } | null)?.name) ?? "Capability",
          proficiency: c.proficiency as Proficiency,
          verification: c.verification_status as VerificationStatus,
          source: c.source as string,
          notes: (c.notes as string | null) ?? null,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.memberNumber ?? "~").localeCompare(b.memberNumber ?? "~"));
}

export async function setCapability(params: {
  profileId: string;
  titleId: string;
  proficiency: Proficiency;
  verification: Exclude<VerificationStatus, "revoked">;
  notes: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("person_capabilities").select("id, proficiency, verification_status").eq("profile_id", params.profileId).eq("operational_title_id", params.titleId).maybeSingle();
  const now = new Date().toISOString();
  const verified = params.verification === "verified";
  const row = {
    proficiency: params.proficiency,
    verification_status: params.verification,
    verified_by: verified ? params.actorUserId : null,
    verified_at: verified ? now : null,
    notes: params.notes,
    updated_at: now,
  };
  const { error } = existing
    ? await admin.from("person_capabilities").update(row).eq("id", existing.id)
    : await admin.from("person_capabilities").insert({ profile_id: params.profileId, operational_title_id: params.titleId, source: "admin", created_by: params.actorUserId, ...row });
  if (error) {
    console.error("[crew-support] failed to set capability", error.message);
    return { ok: false, error: "Could not save this capability. Please try again." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "person_capability.set",
    entityType: "user",
    entityId: params.profileId,
    metadata: { titleId: params.titleId, from: existing ? { proficiency: existing.proficiency, verification: existing.verification_status } : null, to: { proficiency: params.proficiency, verification: params.verification } },
  });
  return { ok: true };
}

export async function revokeCapability(params: { capabilityId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("person_capabilities").select("profile_id, operational_title_id, verification_status").eq("id", params.capabilityId).maybeSingle();
  if (!existing) return { ok: false, error: "Capability not found." };
  const { error } = await admin.from("person_capabilities").update({ verification_status: "revoked", updated_at: new Date().toISOString() }).eq("id", params.capabilityId);
  if (error) {
    console.error("[crew-support] failed to revoke capability", error.message);
    return { ok: false, error: "Could not revoke this capability. Please try again." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "person_capability.revoked",
    entityType: "user",
    entityId: existing.profile_id as string,
    metadata: { titleId: existing.operational_title_id, from: existing.verification_status },
  });
  return { ok: true };
}
