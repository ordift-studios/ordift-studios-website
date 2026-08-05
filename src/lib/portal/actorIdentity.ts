import { createClient } from "@/lib/supabase/server";
import { ROLE_DISPLAY_ORDER, ROLE_LABELS } from "@/lib/portal/profileCard";
import type { RoleSlug } from "@/lib/portal/roles";

// Platform-wide Audit Identity Standard (2026-08-05, see
// ARCHITECTURE_DECISIONS.md). Every audit/workflow table already
// records "who" as a profile_id FK (activity_log.actor_user_id,
// workflow_statuses.submitted_by/reviewed_by, workflow_assignments.
// assigned_by/removed_by, and so on) — never a name. profiles.
// member_number is the one immutable, human-readable identifier that
// FK already resolves to, so it's the authoritative label for every
// "Created By / Reviewed By / Approved By / ..." surface. This module
// is the single place that resolves a batch of profile ids into
// {memberNumber, fullName, roleLabel, department} for display —
// every future module (bookings, HR, models, workshops, finance,
// legal, CRM, reports) should call this rather than re-deriving its
// own actor label.
//
// Three queries regardless of how many distinct actors are in the
// batch (not N+1), same discipline as getProfileCard()'s single-user
// version in profileCard.ts, which this deliberately doesn't replace —
// that one also resolves Grade (admin-gated) and tenure for the
// self-view Quick Card, neither of which belongs in an audit-trail
// label.

export type ActorIdentity = {
  id: string;
  fullName: string | null;
  memberNumber: string | null;
  roleLabel: string | null;
  department: string | null;
};

function formatRoleLabel(roles: RoleSlug[]): string | null {
  const label = ROLE_DISPLAY_ORDER.filter((slug) => roles.includes(slug))
    .map((slug) => ROLE_LABELS[slug])
    .join(", ");
  return label || null;
}

// The display label the user asked for: Member Number as the
// authoritative identifier, full name alongside for convenience.
// Falls back to full name (then a generic placeholder) for accounts
// that don't have a member_number yet, so nothing ever renders blank.
export function formatActorLabel(identity: ActorIdentity | null | undefined): string {
  if (!identity) return "Unknown";
  if (identity.memberNumber) {
    return identity.fullName ? `${identity.memberNumber} — ${identity.fullName}` : identity.memberNumber;
  }
  return identity.fullName ?? "Unknown";
}

export async function resolveActorIdentities(userIds: string[]): Promise<Map<string, ActorIdentity>> {
  const distinctIds = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, ActorIdentity>();
  if (distinctIds.length === 0) return result;

  const supabase = await createClient();
  const [{ data: profiles }, { data: userRoles }, { data: staffDetails }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, member_number").in("id", distinctIds),
    supabase.from("user_roles").select("user_id, roles(slug)").in("user_id", distinctIds),
    supabase.from("staff_details").select("id, department").in("id", distinctIds),
  ]);

  const rolesByUser = new Map<string, RoleSlug[]>();
  for (const row of userRoles ?? []) {
    const slug = (row.roles as unknown as { slug: RoleSlug } | null)?.slug;
    if (!slug) continue;
    const existing = rolesByUser.get(row.user_id) ?? [];
    existing.push(slug);
    rolesByUser.set(row.user_id, existing);
  }

  const departmentByUser = new Map<string, string | null>();
  for (const row of staffDetails ?? []) {
    departmentByUser.set(row.id, row.department ?? null);
  }

  for (const profile of profiles ?? []) {
    result.set(profile.id, {
      id: profile.id,
      fullName: profile.full_name ?? null,
      memberNumber: profile.member_number ?? null,
      roleLabel: formatRoleLabel(rolesByUser.get(profile.id) ?? []),
      department: departmentByUser.get(profile.id) ?? null,
    });
  }

  return result;
}

export async function resolveActorIdentity(userId: string | null): Promise<ActorIdentity | null> {
  if (!userId) return null;
  const map = await resolveActorIdentities([userId]);
  return map.get(userId) ?? null;
}
