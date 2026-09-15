import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { canManageOnboarding } from "@/lib/organization/onboarding";

// Vendor Completion Phase (2026-09-15) — wires public.vendor_profiles
// (migration 0001), previously a genuine scaffold with zero write path
// anywhere in the codebase (confirmed by the Vendor Portal & Vendor
// Onboarding Readiness Audit: 0 rows in Production). This module is
// the FIRST real write path for that table — reused in place, never
// replaced or duplicated, per the Canonical Vendor Model (see the
// Vendor Completion Phase report): vendor_profiles is authoritative
// for a vendor's COMPANY-FACING IDENTITY (company_name/status), while
// auth.users/profiles remains authoritative for account identity,
// staff_details.engagement_type_id for operational classification
// (vendor_supplier), and payee_profiles for payment classification —
// four distinct concerns, four distinct tables, none of them
// duplicating another's authority.
//
// Same authorization tier as every other onboarding-management action
// (canManageOnboarding — Super Admin or operations.administer),
// deliberately reused rather than inventing a vendor-specific
// capability, since standing up a vendor's profile is itself an
// onboarding action.

export type VendorProfile = {
  id: string;
  companyName: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  fullName: string | null;
  // Vendor QA correction (2026-09-15) — see migration 0123's header
  // comment: deliberately NOT the employee-shaped
  // employment_jurisdiction_id elsewhere; this is the Vendor
  // relationship's own field, reusing the same generic
  // employment_jurisdictions lookup table.
  relationshipJurisdictionId: string | null;
  relationshipJurisdictionName: string | null;
};

const SELECT = "id, company_name, status, metadata, created_at, relationship_jurisdiction_id";

type RawVendorProfileRow = {
  id: string;
  company_name: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  relationship_jurisdiction_id: string | null;
};

async function attachFullName(admin: ReturnType<typeof createAdminClient>, rows: RawVendorProfileRow[]): Promise<VendorProfile[]> {
  if (rows.length === 0) return [];
  const jurisdictionIds = [...new Set(rows.map((r) => r.relationship_jurisdiction_id).filter((id): id is string => Boolean(id)))];
  const [{ data: profiles, error }, { data: jurisdictions }] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", rows.map((r) => r.id)),
    jurisdictionIds.length > 0 ? admin.from("employment_jurisdictions").select("id, name").in("id", jurisdictionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  if (error) console.error("[vendors] failed to load profiles for vendor_profiles", error.message);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
  const jurisdictionNameById = new Map((jurisdictions ?? []).map((j) => [j.id, j.name]));
  return rows.map((r) => ({
    id: r.id,
    companyName: r.company_name,
    status: r.status,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    fullName: nameById.get(r.id) ?? null,
    relationshipJurisdictionId: r.relationship_jurisdiction_id,
    relationshipJurisdictionName: r.relationship_jurisdiction_id ? (jurisdictionNameById.get(r.relationship_jurisdiction_id) ?? null) : null,
  }));
}

export async function listVendorProfiles(actorUserId: string): Promise<VendorProfile[]> {
  if (!(await canManageOnboarding(actorUserId))) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("vendor_profiles").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[vendors] failed to load vendor_profiles", error.message);
    return [];
  }
  return attachFullName(admin, data ?? []);
}

export async function getVendorProfile(vendorProfileId: string): Promise<VendorProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("vendor_profiles").select(SELECT).eq("id", vendorProfileId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[vendors] failed to load vendor_profile", error.message);
    return null;
  }
  const [attached] = await attachFullName(admin, [data]);
  return attached ?? null;
}

// Self-view for the vendor's own portal page — same "this is literally
// your own row" exemption from the admin-tier gate as
// getOwnPayeeProfile() in payeeProfiles.ts.
export async function getOwnVendorProfile(profileId: string): Promise<VendorProfile | null> {
  return getVendorProfile(profileId);
}

export type UpsertVendorProfileParams = {
  profileId: string;
  // Vendor QA correction (2026-09-15) — deliberately OPTIONAL, matching
  // the schema (vendor_profiles.company_name has no NOT NULL, migration
  // 0001) and the approved OS-LGL-009 architecture, which explicitly
  // covers both "registered businesses/entities" AND "legitimate
  // individual/sole providers" — a real individual vendor genuinely may
  // have no separate company/trading name, and this must never force
  // one to be invented. Empty/whitespace-only is stored as null (a
  // genuine absence), never coerced to an empty string. Where a display
  // name is needed and this is null, callers fall back to the account's
  // own full_name (already the established pattern on the vendor list/
  // detail pages).
  companyName?: string | null;
  // Optional — undefined leaves the existing value untouched (the
  // upsert's `on_conflict` merge below only sets the column when this
  // is explicitly provided); explicit null clears it back to genuinely
  // unset. Never inferred/guessed.
  relationshipJurisdictionId?: string | null;
  actorUserId: string;
};

// Idempotent by design (insert-or-update on the same 1:1 id), unlike
// createPayeeProfile()'s deliberate insert-only "already classified"
// refusal — a vendor's company profile is expected to be recorded and
// corrected as the SAME onboarding progresses (Sequence: profile
// stage), not a one-time irreversible classification event the way
// payee-category assignment is.
export async function upsertVendorProfile(params: UpsertVendorProfileParams): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record vendor profile details." };
  }
  const companyName = params.companyName?.trim() || null;

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("id").eq("id", params.profileId).maybeSingle();
  if (!existingProfile) return { ok: false, error: "No account exists for that profile — the vendor must have an Ordift account first (via invitation)." };

  const { error } = await admin
    .from("vendor_profiles")
    .upsert(
      {
        id: params.profileId,
        company_name: companyName,
        ...(params.relationshipJurisdictionId !== undefined ? { relationship_jurisdiction_id: params.relationshipJurisdictionId } : {}),
      },
      { onConflict: "id" }
    );
  if (error) {
    console.error("[vendors] failed to upsert vendor_profile", error.message);
    return { ok: false, error: "Failed to record the vendor profile." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "vendor_profile.recorded",
    entityType: "user",
    entityId: params.profileId,
    metadata: { companyName, relationshipJurisdictionId: params.relationshipJurisdictionId ?? undefined },
  });

  return { ok: true };
}

export async function setVendorProfileStatus(params: {
  vendorProfileId: string;
  status: "pending" | "active" | "inactive";
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to change vendor status." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("vendor_profiles").update({ status: params.status }).eq("id", params.vendorProfileId);
  if (error) {
    console.error("[vendors] failed to update vendor_profile status", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "vendor_profile.status_changed",
    entityType: "user",
    entityId: params.vendorProfileId,
    metadata: { status: params.status },
  });

  return { ok: true };
}

// ============================================================
// Admin vendor management surface — one consolidated read, rather than
// the generic person-management screens (Full Profile, legal-entities,
// etc.), per the explicit instruction to provide a dedicated vendor
// workspace an admin can understand at a glance rather than "requiring
// normal operation through unrelated generic screens." Every source
// table here is REUSED, not duplicated (Canonical Vendor Model): the
// "vendor" role (identity/access), vendor_profiles (company identity),
// staff_details.engagement_type_id (operational classification),
// staff_onboarding (onboarding lifecycle), payee_profiles/
// payment_instructions (payment readiness) — this function only reads
// and joins them in application code, the same "two plain queries over
// an embed" style already established by payeeProfiles.ts's own header
// comment.
// ============================================================

export type VendorWorkspaceRow = {
  profileId: string;
  fullName: string | null;
  memberNumber: string | null;
  companyName: string | null;
  vendorProfileStatus: string | null; // null = vendor_profiles row doesn't exist yet
  engagementTypeSlug: string | null;
  onboardingId: string | null;
  onboardingStatus: string | null;
  onboardingStage: string | null;
  hasPayeeProfile: boolean;
  hasPaymentInstructions: boolean;
};

export async function listVendorWorkspaceRows(actorUserId: string): Promise<VendorWorkspaceRow[]> {
  if (!(await canManageOnboarding(actorUserId))) return [];
  const admin = createAdminClient();

  const { data: vendorRole } = await admin.from("roles").select("id").eq("slug", "vendor").maybeSingle();
  if (!vendorRole) return [];
  const { data: userRoleRows, error: userRoleError } = await admin.from("user_roles").select("user_id").eq("role_id", vendorRole.id);
  if (userRoleError) {
    console.error("[vendors] failed to load vendor user_roles", userRoleError.message);
    return [];
  }
  const profileIds = (userRoleRows ?? []).map((r) => r.user_id as string);
  if (profileIds.length === 0) return [];

  const [profilesRes, vendorProfilesRes, staffDetailsRes, onboardingRes, payeeRes, paymentRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number").in("id", profileIds),
    admin.from("vendor_profiles").select("id, company_name, status").in("id", profileIds),
    admin.from("staff_details").select("id, engagement_types(slug)").in("id", profileIds),
    admin.from("staff_onboarding").select("id, profile_id, status, stage").in("profile_id", profileIds),
    admin.from("payee_profiles").select("id").in("id", profileIds),
    admin.from("payment_instructions").select("profile_id").in("profile_id", profileIds),
  ]);
  if (profilesRes.error) console.error("[vendors] failed to load profiles for vendor workspace", profilesRes.error.message);

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const vendorProfileById = new Map((vendorProfilesRes.data ?? []).map((v) => [v.id, v]));
  const staffDetailsById = new Map((staffDetailsRes.data ?? []).map((s) => [s.id, s]));
  const onboardingByProfileId = new Map((onboardingRes.data ?? []).map((o) => [o.profile_id, o]));
  const payeeProfileIds = new Set((payeeRes.data ?? []).map((p) => p.id));
  const paymentProfileIds = new Set((paymentRes.data ?? []).map((p) => p.profile_id));

  return profileIds.map((profileId) => {
    const profile = profileById.get(profileId);
    const vendorProfile = vendorProfileById.get(profileId);
    const staffDetails = staffDetailsById.get(profileId);
    const onboarding = onboardingByProfileId.get(profileId);
    const engagementType = staffDetails?.engagement_types as unknown as { slug: string } | null;
    return {
      profileId,
      fullName: profile?.full_name ?? null,
      memberNumber: profile?.member_number ?? null,
      companyName: vendorProfile?.company_name ?? null,
      vendorProfileStatus: vendorProfile?.status ?? null,
      engagementTypeSlug: engagementType?.slug ?? null,
      onboardingId: onboarding?.id ?? null,
      onboardingStatus: onboarding?.status ?? null,
      onboardingStage: onboarding?.stage ?? null,
      hasPayeeProfile: payeeProfileIds.has(profileId),
      hasPaymentInstructions: paymentProfileIds.has(profileId),
    };
  });
}
