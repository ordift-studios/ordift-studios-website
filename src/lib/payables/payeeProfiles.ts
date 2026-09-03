import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

// Universal Payables System (2026-09-03), Part A — against
// public.payee_profiles (supabase/migrations/0049_universal_payables.sql).
// Deliberately not vendor_profiles/model_profiles — see that
// migration's inspection summary for why. category is documented,
// unconstrained text: 'staff' | 'vendor' | 'contractor' | 'freelancer'
// | 'instructor' | 'talent' | 'consultant' | 'other'.
//
// PAYEE_CATEGORIES/validateCreatePayeeProfileInput live in
// payeeProfileShared.ts, not here, and are re-exported below purely
// for existing call-site convenience — see that file's header for why
// (this module is server-only; anything a "use client" component needs
// must come from a module with zero server-only imports).
export { PAYEE_CATEGORIES, type PayeeCategory, validateCreatePayeeProfileInput } from "./payeeProfileShared";

// Duplicate safeguard (2026-09-04 investigation) — payee_profiles.id
// IS the profile's own primary key (references public.profiles(id),
// 0049), the same 1:1-by-construction pattern as model_profiles/
// vendor_profiles/staff_details since 0001. A second attempt to
// classify the same account is structurally impossible at the database
// level; Postgres rejects it as a unique-violation (code 23505). This
// pure mapping is the app-layer translation of that DB-level safeguard
// into a message an administrator can act on, independent of any UI
// double-click protection — directly testable without a database.
export function mapCreatePayeeProfileError(code: string | undefined): string {
  if (code === "23505") return "This person is already classified as a payee.";
  return "Failed to create the payee profile.";
}

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

// Read-path fix (2026-09-04 investigation) — payee_profiles has TWO
// foreign keys to profiles (id -> profiles.id, AND created_by ->
// profiles.id; confirmed via pg_constraint against real Production
// schema). A PostgREST embed like `profiles!inner(full_name)`, with no
// constraint specified, is genuinely ambiguous between those two paths
// — PostgREST refuses to guess and errors ("more than one relationship
// was found"). That error was being caught and silently turned into an
// empty array by this function's own error handling — proven live:
// Sylvia's real payee_profiles row existed the entire time (confirmed
// directly against Production, and by matching activity_log), while
// listPayeeProfiles() returned []. A raw SQL join against the same
// tables/columns returned her correctly, ruling out any data problem.
//
// Fixed by never using embed syntax here at all — two plain,
// unambiguous queries (payee_profiles, then profiles/operational_titles
// by id list) joined in application code, the same pattern
// listUsersWithRoles() (src/lib/portal/adminData.ts) already uses.
// This is immune to any future FK PostgREST might also consider a
// candidate relationship (e.g. if a third FK to profiles or
// operational_titles is ever added) — a qualified embed hint
// (`profiles!payee_profiles_id_fkey(...)`) would have fixed today's
// specific case but could break again the same way the moment schema
// changes; a manual join never can.
const SELECT = "id, category, operational_title_id, company_name, status, notes, created_at";

type RawPayeeProfileRow = {
  id: string;
  category: string;
  operational_title_id: string | null;
  company_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

async function attachPayeeProfileRelations(admin: ReturnType<typeof createAdminClient>, rows: RawPayeeProfileRow[]): Promise<PayeeProfile[]> {
  if (rows.length === 0) return [];

  const profileIds = rows.map((r) => r.id);
  const titleIds = [...new Set(rows.map((r) => r.operational_title_id).filter((id): id is string => Boolean(id)))];

  const [profilesResult, titlesResult] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", profileIds),
    titleIds.length > 0 ? admin.from("operational_titles").select("id, name").in("id", titleIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) console.error("[payables] failed to load profiles for payee_profiles", profilesResult.error.message);
  if (titlesResult.error) console.error("[payables] failed to load operational_titles for payee_profiles", titlesResult.error.message);

  const nameByProfileId = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name as string | null]));
  const nameByTitleId = new Map((titlesResult.data ?? []).map((t) => [t.id, t.name as string]));

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    operationalTitleId: r.operational_title_id,
    operationalTitleName: r.operational_title_id ? (nameByTitleId.get(r.operational_title_id) ?? null) : null,
    companyName: r.company_name,
    status: r.status,
    notes: r.notes,
    fullName: nameByProfileId.get(r.id) ?? null,
    createdAt: r.created_at,
  }));
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
  return attachPayeeProfileRelations(admin, data ?? []);
}

export async function getPayeeProfile(payeeProfileId: string): Promise<PayeeProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payee_profiles").select(SELECT).eq("id", payeeProfileId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[payables] failed to load payee_profile", error.message);
    return null;
  }
  const [attached] = await attachPayeeProfileRelations(admin, [data]);
  return attached ?? null;
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
    return { ok: false, error: mapCreatePayeeProfileError(error.code) };
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
