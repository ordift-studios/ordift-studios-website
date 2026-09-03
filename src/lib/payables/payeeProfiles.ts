import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

// Universal Payables System (2026-09-03), Part A — against
// public.payee_profiles (supabase/migrations/0049_universal_payables.sql).
// Deliberately not vendor_profiles/model_profiles — see that
// migration's inspection summary for why. category is documented,
// unconstrained text: 'staff' | 'vendor' | 'contractor' | 'freelancer'
// | 'instructor' | 'talent' | 'consultant' | 'other'.

export const PAYEE_CATEGORIES = ["staff", "vendor", "contractor", "freelancer", "instructor", "talent", "consultant", "other"] as const;
export type PayeeCategory = (typeof PAYEE_CATEGORIES)[number];

export type PayeeProfile = {
  id: string;
  category: string;
  operationalTitleId: string | null;
  operationalTitleName: string | null;
  companyName: string | null;
  status: string;
  notes: string | null;
  fullName: string | null;
  createdAt: string;
};

const SELECT = "id, category, operational_title_id, company_name, status, notes, created_at, operational_titles(name), profiles!inner(full_name)";

type RawPayeeProfileRow = {
  id: string;
  category: string;
  operational_title_id: string | null;
  company_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  operational_titles: { name: string } | null;
  profiles: { full_name: string | null } | null;
};

function mapPayeeProfile(r: RawPayeeProfileRow): PayeeProfile {
  return {
    id: r.id,
    category: r.category,
    operationalTitleId: r.operational_title_id,
    operationalTitleName: r.operational_titles?.name ?? null,
    companyName: r.company_name,
    status: r.status,
    notes: r.notes,
    fullName: r.profiles?.full_name ?? null,
    createdAt: r.created_at,
  };
}

// Listing is a Finance-tier operation (matches listAllPaymentObligations'
// own admin-tier scope) — callers must hold finance.payee.administer or
// be Super Admin. Returns [] (not an error) on a denied check, mirroring
// this codebase's existing fail-closed list-function convention.
export async function listPayeeProfiles(actorUserId: string): Promise<PayeeProfile[]> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("payee_profiles").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[payables] failed to load payee_profiles", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapPayeeProfile(r as unknown as RawPayeeProfileRow));
}

export async function getPayeeProfile(payeeProfileId: string): Promise<PayeeProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payee_profiles").select(SELECT).eq("id", payeeProfileId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[payables] failed to load payee_profile", error.message);
    return null;
  }
  return mapPayeeProfile(data as unknown as RawPayeeProfileRow);
}

export type CreatePayeeProfileParams = {
  profileId: string;
  category: string;
  operationalTitleId?: string | null;
  companyName?: string | null;
  notes?: string | null;
  actorUserId: string;
};

// Requires an EXISTING profiles row (a real account) — this function
// classifies an existing person as a payee, it never creates a new
// auth.users/profiles row itself (that remains handle_new_user()'s
// (0001) exclusive job, or a future explicit "invite an external
// payee" flow if ever needed — out of scope here).
export async function createPayeeProfile(params: CreatePayeeProfileParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer payees." };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("id").eq("id", params.profileId).maybeSingle();
  if (!existingProfile) return { ok: false, error: "No account exists for that profile — the person must have (or create) an Ordift account first." };

  const { error } = await admin.from("payee_profiles").insert({
    id: params.profileId,
    category: params.category,
    operational_title_id: params.operationalTitleId ?? null,
    company_name: params.companyName ?? null,
    notes: params.notes ?? null,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[payables] failed to create payee_profile", error.message);
    return { ok: false, error: error.code === "23505" ? "This person is already classified as a payee." : "Failed to create the payee profile." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payee_profile.created",
    entityType: "user",
    entityId: params.profileId,
    metadata: { category: params.category, actedAsSuperAdminOverride: auth.actedAsOverride },
  });

  return { ok: true };
}

export async function setPayeeProfileStatus(params: {
  payeeProfileId: string;
  status: "active" | "inactive" | "suspended";
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer payees." };

  const admin = createAdminClient();
  const { error } = await admin.from("payee_profiles").update({ status: params.status }).eq("id", params.payeeProfileId);
  if (error) {
    console.error("[payables] failed to update payee_profile status", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payee_profile.status_changed",
    entityType: "user",
    entityId: params.payeeProfileId,
    metadata: { status: params.status },
  });

  return { ok: true };
}

// Used by the payee-facing self-view (portal) — no capability check
// beyond "this is literally your own row", so it stays a plain
// isSuperAdminId-free helper distinct from the admin-tier functions
// above.
export async function getOwnPayeeProfile(profileId: string): Promise<PayeeProfile | null> {
  return getPayeeProfile(profileId);
}

// Re-exported for callers that only need a boolean, e.g. deciding
// whether to show the payee-portal nav entry at all.
export async function isSuperAdmin(profileId: string): Promise<boolean> {
  return isSuperAdminId(profileId);
}
