import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { getCurrentEmploymentTerms } from "@/lib/organization/employmentTermsHistory";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 18 (2026-09-14) —
// employment records and references, OS-HR-GH-006 section 7. The final
// module of the originally-authorized 74-section Ghana HR/Employment
// scope.

// --- pure functions --------------------------------------------------

// Pure — OS-HR-GH-006 7.4's "Copy/Hash of Issued Reference." A
// deterministic SHA-256 digest of the exact issued content, computed
// with no side effects and no external state.
export function computeReferenceContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function canManageReferences(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// --- reference requests --------------------------------------------------

export type EmploymentReferenceStatus = "employee" | "former_employee";
export type ReferenceType = "standard_verification" | "detailed_corporate_reference";

export async function requestEmploymentReference(params: {
  profileId: string;
  requesterName: string;
  requesterOrganization?: string | null;
  requesterContact?: string | null;
  employeeOrFormerEmployee: EmploymentReferenceStatus;
  referenceType: ReferenceType;
  actorUserId: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  if (!(await canManageReferences(params.actorUserId))) {
    return { ok: false, error: "Not authorized to log a reference request." };
  }
  if (!params.requesterName.trim()) return { ok: false, error: "The requester's name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reference_requests")
    .insert({
      profile_id: params.profileId,
      requester_name: params.requesterName,
      requester_organization: params.requesterOrganization ?? null,
      requester_contact: params.requesterContact ?? null,
      employee_or_former_employee: params.employeeOrFormerEmployee,
      reference_type: params.referenceType,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to log the reference request." };

  await logActivity({ actorUserId: params.actorUserId, action: "reference_request.logged", entityType: "user", entityId: params.profileId, metadata: { requestId: data.id, referenceType: params.referenceType } });
  return { ok: true, requestId: data.id };
}

// The real OS-HR-GH-006 7.4 "Identity/Authority Verification" gate —
// nothing can be issued while this is false (see the atomic guards on
// both issue functions below).
export async function verifyRequesterIdentity(params: { requestId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferences(params.actorUserId))) {
    return { ok: false, error: "Not authorized to verify a requester's identity/authority." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reference_requests")
    .update({ identity_authority_verified: true, identity_verified_by: params.actorUserId, identity_verified_at: new Date().toISOString() })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .eq("identity_authority_verified", false)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to verify the requester." };
  if (!data) return { ok: false, error: "Request not found, already decided, or identity already verified." };
  return { ok: true };
}

export async function declineReferenceRequest(params: { requestId: string; decisionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferences(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decline a reference request." };
  }
  if (!params.decisionNotes.trim()) return { ok: false, error: "Decision notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reference_requests")
    .update({ status: "declined", decision_notes: params.decisionNotes })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decline the request." };
  if (!data) return { ok: false, error: "Request not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "reference_request.declined", entityType: "user", entityId: data.profile_id, metadata: { requestId: params.requestId } });
  return { ok: true };
}

// The real OS-HR-GH-006 7.2 "standard external response" — assembled
// ONLY from identity/role-title/employing-entity/dates, pulled from
// existing records (profiles, employment_terms_history, migration
// 0086; staff_onboarding, migration 0046; separation_cases, migration
// 0079, the canonical separation record per migration 0104's schema
// reconciliation). This function accepts no free-text content parameter at all —
// there is no way to make it disclose anything beyond those four
// fields, which is what keeps it structurally distinct from
// issueDetailedCorporateReference() below.
export async function issueStandardEmploymentVerification(params: { requestId: string; actorUserId: string }): Promise<{ ok: true; content: string; hash: string } | { ok: false; error: string }> {
  if (!(await canManageReferences(params.actorUserId))) {
    return { ok: false, error: "Not authorized to issue an employment verification." };
  }

  const admin = createAdminClient();
  const { data: request } = await admin.from("reference_requests").select("id, profile_id, status, identity_authority_verified, reference_type").eq("id", params.requestId).maybeSingle();
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "requested") return { ok: false, error: "This request has already been decided." };
  if (!request.identity_authority_verified) return { ok: false, error: "Identity/authority must be verified before a reference can be issued." };
  if (request.reference_type !== "standard_verification") return { ok: false, error: "This request is not a standard_verification request." };

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", request.profile_id).maybeSingle();
  const terms = await getCurrentEmploymentTerms(request.profile_id);
  const { data: onboarding } = await admin.from("staff_onboarding").select("start_date").eq("profile_id", request.profile_id).maybeSingle();
  // separation_cases (migration 0079) is the canonical separation record
  // — see migration 0104's schema reconciliation. confirmed_last_working_date
  // is set by closeEmployment() (separationCases.ts) at the same moment
  // offboarding_stage reaches 'employment_closed'.
  const { data: separation } = await admin
    .from("separation_cases")
    .select("confirmed_last_working_date")
    .eq("profile_id", request.profile_id)
    .eq("offboarding_stage", "employment_closed")
    .order("confirmed_last_working_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let positionName: string | null = null;
  if (terms?.positionId) {
    const { data: position } = await admin.from("positions").select("name").eq("id", terms.positionId).maybeSingle();
    positionName = position?.name ?? null;
  }
  let employingEntityName: string | null = null;
  if (terms?.employingEntityId) {
    const { data: entity } = await admin.from("employing_entities").select("name").eq("id", terms.employingEntityId).maybeSingle();
    employingEntityName = entity?.name ?? null;
  }

  const content = [
    `Full name: ${profile?.full_name ?? "unknown"}`,
    `Role/title: ${positionName ?? "not on record"}`,
    `Employing entity: ${employingEntityName ?? "not on record"}`,
    `Employment start date: ${onboarding?.start_date ?? "not on record"}`,
    `Employment end date: ${separation?.confirmed_last_working_date ?? "current employee / not on record"}`,
  ].join("\n");
  const hash = computeReferenceContentHash(content);

  const { data, error } = await admin
    .from("reference_requests")
    .update({ status: "issued", issued_by: params.actorUserId, issued_at: new Date().toISOString(), issued_reference_content: content, issued_reference_hash: hash })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to issue the verification." };
  if (!data) return { ok: false, error: "The request changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "employment_verification.issued", entityType: "user", entityId: request.profile_id, metadata: { requestId: params.requestId, hash } });
  return { ok: true, content, hash };
}

// OS-HR-GH-006 7.2: "Detailed corporate references require authorized
// issuance and appropriate scope." informationAuthorizedForRelease and
// content are always human-authored, non-empty, caller-supplied
// values — this function never auto-assembles content the way
// issueStandardEmploymentVerification() does, and never reads from
// grievances/disciplinary_actions/safeguarding_concern_reports/
// security_incident_reports or any medical/health data.
export async function issueDetailedCorporateReference(params: { requestId: string; informationAuthorizedForRelease: string; content: string; actorUserId: string }): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
  if (!(await canManageReferences(params.actorUserId))) {
    return { ok: false, error: "Not authorized to issue a detailed corporate reference." };
  }
  if (!params.informationAuthorizedForRelease.trim()) return { ok: false, error: "The information authorized for release must be explicitly scoped." };
  if (!params.content.trim()) return { ok: false, error: "Reference content is required." };

  const admin = createAdminClient();
  const { data: request } = await admin.from("reference_requests").select("id, profile_id, status, identity_authority_verified, reference_type").eq("id", params.requestId).maybeSingle();
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "requested") return { ok: false, error: "This request has already been decided." };
  if (!request.identity_authority_verified) return { ok: false, error: "Identity/authority must be verified before a reference can be issued." };
  if (request.reference_type !== "detailed_corporate_reference") return { ok: false, error: "This request is not a detailed_corporate_reference request." };

  const hash = computeReferenceContentHash(params.content);
  const { data, error } = await admin
    .from("reference_requests")
    .update({
      status: "issued",
      information_authorized_for_release: params.informationAuthorizedForRelease,
      issued_by: params.actorUserId,
      issued_at: new Date().toISOString(),
      issued_reference_content: params.content,
      issued_reference_hash: hash,
    })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to issue the reference." };
  if (!data) return { ok: false, error: "The request changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "detailed_corporate_reference.issued", entityType: "user", entityId: request.profile_id, metadata: { requestId: params.requestId, hash } });
  return { ok: true, hash };
}

export async function listReferenceRequestsForProfile(profileId: string): Promise<
  {
    id: string;
    referenceType: string;
    status: string;
    requesterName: string;
    requesterOrganization: string | null;
    employeeOrFormerEmployee: string;
    identityAuthorityVerified: boolean;
    issuedAt: string | null;
    issuedReferenceContent: string | null;
    issuedReferenceHash: string | null;
  }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reference_requests")
    .select(
      "id, reference_type, status, requester_name, requester_organization, employee_or_former_employee, identity_authority_verified, issued_at, issued_reference_content, issued_reference_hash"
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load reference_requests", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    referenceType: r.reference_type,
    status: r.status,
    requesterName: r.requester_name,
    requesterOrganization: r.requester_organization,
    employeeOrFormerEmployee: r.employee_or_former_employee,
    identityAuthorityVerified: r.identity_authority_verified,
    issuedAt: r.issued_at,
    issuedReferenceContent: r.issued_reference_content,
    issuedReferenceHash: r.issued_reference_hash,
  }));
}
