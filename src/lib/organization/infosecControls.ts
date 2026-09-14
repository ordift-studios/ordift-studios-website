import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 11 (2026-09-14) —
// information security / AI / BYOD controls, OS-HR-GH-005 1.3 and
// section 2. No numeric formula exists anywhere in this section of the
// controlled document, so this module carries no pure/computed
// functions — matching this codebase's established convention for
// sections with nothing to compute (see assets.ts, grievances.ts).

async function canManageInfosecControls(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// authorizedScope is a required, human-written description of exactly
// what is controlled on this device — OS-HR-GH-005 1.3's boundary
// (business accounts/apps/company data/security config only, never
// "unrestricted surveillance of unrelated personal content") is kept a
// documented, specific scope every time, never an implicit blanket.
export async function authorizeByodDevice(params: { profileId: string; deviceDescription: string; authorizedScope: string; actorUserId: string }): Promise<{ ok: true; authorizationId: string } | { ok: false; error: string }> {
  if (!(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to authorize a personal device." };
  }
  if (!params.deviceDescription.trim()) return { ok: false, error: "A device description is required." };
  if (!params.authorizedScope.trim()) return { ok: false, error: "The authorized scope must be documented." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("byod_device_authorizations")
    .insert({ profile_id: params.profileId, device_description: params.deviceDescription, authorized_scope: params.authorizedScope, authorized_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to authorize the device." };

  await logActivity({ actorUserId: params.actorUserId, action: "byod_device.authorized", entityType: "user", entityId: params.profileId, metadata: { authorizationId: data.id } });
  return { ok: true, authorizationId: data.id };
}

export async function revokeByodDeviceAuthorization(params: { authorizationId: string; reason: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to revoke a device authorization." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A reason is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("byod_device_authorizations")
    .update({ status: "revoked", revoked_by: params.actorUserId, revoked_at: new Date().toISOString(), revoked_reason: params.reason })
    .eq("id", params.authorizationId)
    .eq("status", "active")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to revoke the authorization." };
  if (!data) return { ok: false, error: "Authorization not found, or already revoked." };

  await logActivity({ actorUserId: params.actorUserId, action: "byod_device.revoked", entityType: "user", entityId: data.profile_id, metadata: { authorizationId: params.authorizationId } });
  return { ok: true };
}

export async function listByodDeviceAuthorizationsForProfile(profileId: string): Promise<{ id: string; deviceDescription: string; status: string; authorizedAt: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("byod_device_authorizations").select("id, device_description, status, authorized_at").eq("profile_id", profileId).order("authorized_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load byod_device_authorizations", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, deviceDescription: r.device_description, status: r.status, authorizedAt: r.authorized_at }));
}

// No row is ever seeded automatically — an authorization only exists
// because an administrator explicitly registered a real, specific use,
// matching OS-HR-GH-005 2.3's "unless the specific use/tool is
// authorized" — never a default "AI is allowed" assumption.
export async function authorizeAiTool(params: { toolName: string; authorizedUseDescription: string; restrictions?: string | null; actorUserId: string }): Promise<{ ok: true; toolId: string } | { ok: false; error: string }> {
  if (!(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to authorize an AI tool." };
  }
  if (!params.toolName.trim()) return { ok: false, error: "A tool name is required." };
  if (!params.authorizedUseDescription.trim()) return { ok: false, error: "The authorized use must be documented." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_ai_tools")
    .insert({ tool_name: params.toolName, authorized_use_description: params.authorizedUseDescription, restrictions: params.restrictions ?? null, authorized_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "This tool is already registered." };
    return { ok: false, error: error?.message ?? "Failed to authorize the AI tool." };
  }
  return { ok: true, toolId: data.id };
}

export async function revokeAiToolAuthorization(params: { toolId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to revoke an AI tool authorization." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_ai_tools")
    .update({ status: "revoked", revoked_by: params.actorUserId, revoked_at: new Date().toISOString() })
    .eq("id", params.toolId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to revoke the AI tool authorization." };
  if (!data) return { ok: false, error: "Tool not found, or already revoked." };
  return { ok: true };
}

export async function listAuthorizedAiTools(): Promise<{ id: string; toolName: string; authorizedUseDescription: string; status: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("authorized_ai_tools").select("id, tool_name, authorized_use_description, status").order("tool_name", { ascending: true });
  if (error) {
    console.error("[organization] failed to load authorized_ai_tools", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, toolName: r.tool_name, authorizedUseDescription: r.authorized_use_description, status: r.status }));
}

export const AI_ASSISTED_OUTPUT_CATEGORIES = ["client", "legal_document", "financial", "hr_decision", "published_company_material", "other"] as const;
export type AiAssistedOutputCategory = (typeof AI_ASSISTED_OUTPUT_CATEGORIES)[number];

// Every submission starts at review_outcome='pending' — an AI tool's
// own output is never self-approving; a human reviewer is always the
// one who moves this to approved/rejected/revised.
export async function submitAiAssistedOutputForReview(params: { submittedBy: string; category: AiAssistedOutputCategory; description: string; aiToolId?: string | null; actorUserId: string }): Promise<{ ok: true; reviewId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.submittedBy;
  if (!isSelf && !(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to submit AI-assisted output for review on behalf of another person." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description of the AI-assisted output is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_assisted_output_reviews")
    .insert({ submitted_by: params.submittedBy, category: params.category, description: params.description, ai_tool_id: params.aiToolId ?? null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the output for review." };

  await logActivity({ actorUserId: params.actorUserId, action: "ai_assisted_output.submitted_for_review", entityType: "user", entityId: params.submittedBy, metadata: { reviewId: data.id, category: params.category } });
  return { ok: true, reviewId: data.id };
}

export type AiAssistedOutputReviewOutcome = "approved" | "rejected" | "revised";

// The ONLY function that can move review_outcome off 'pending' — the
// real accountable-human-reviewer record OS-HR-GH-005 2.4 requires.
export async function decideAiAssistedOutputReview(params: { reviewId: string; outcome: AiAssistedOutputReviewOutcome; accountabilityNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide an AI-assisted output review." };
  }
  if (!params.accountabilityNotes.trim()) return { ok: false, error: "Accountability notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_assisted_output_reviews")
    .update({ review_outcome: params.outcome, reviewed_by: params.actorUserId, reviewed_at: new Date().toISOString(), accountability_notes: params.accountabilityNotes })
    .eq("id", params.reviewId)
    .eq("review_outcome", "pending")
    .select("id, submitted_by")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the review." };
  if (!data) return { ok: false, error: "Review not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "ai_assisted_output.reviewed", entityType: "user", entityId: data.submitted_by, metadata: { reviewId: params.reviewId, outcome: params.outcome } });
  return { ok: true };
}

export const SECURITY_INCIDENT_TYPES = ["lost_device", "compromised_credentials", "suspicious_login", "malware", "accidental_sharing", "other"] as const;
export type SecurityIncidentType = (typeof SECURITY_INCIDENT_TYPES)[number];

// Deliberately NO authorization check beyond identifying who is
// reporting — OS-HR-GH-005 2.5: "Prompt reporting is encouraged even
// where the employee may have made the initial mistake." A person may
// always report their own incident immediately; reporting on someone
// else's behalf (e.g. IT noticing a colleague's compromised account)
// is also unrestricted, matching this same low-friction precedent.
// Reporting itself never creates or implies any disciplinary
// consequence — nothing in this function touches disciplinary_actions
// or investigations.
export async function reportSecurityIncident(params: { profileId: string; incidentType: SecurityIncidentType; description: string; actorUserId: string }): Promise<{ ok: true; incidentId: string } | { ok: false; error: string }> {
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("security_incident_reports")
    .insert({ profile_id: params.profileId, reported_by: params.actorUserId, incident_type: params.incidentType, description: params.description })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to report the incident." };

  await logActivity({ actorUserId: params.actorUserId, action: "security_incident.reported", entityType: "user", entityId: params.profileId, metadata: { incidentId: data.id, incidentType: params.incidentType } });
  return { ok: true, incidentId: data.id };
}

export async function updateSecurityIncidentStatus(params: { incidentId: string; status: "investigating" | "resolved"; resolutionNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageInfosecControls(params.actorUserId))) {
    return { ok: false, error: "Not authorized to update a security incident's status." };
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = { status: params.status };
  if (params.status === "resolved") {
    update.resolved_by = params.actorUserId;
    update.resolved_at = new Date().toISOString();
    update.resolution_notes = params.resolutionNotes ?? null;
  }

  const { data, error } = await admin.from("security_incident_reports").update(update).eq("id", params.incidentId).neq("status", "resolved").select("id, profile_id").maybeSingle();
  if (error) return { ok: false, error: "Failed to update the incident status." };
  if (!data) return { ok: false, error: "Incident not found, or already resolved." };

  await logActivity({ actorUserId: params.actorUserId, action: "security_incident.status_updated", entityType: "user", entityId: data.profile_id, metadata: { incidentId: params.incidentId, status: params.status } });
  return { ok: true };
}

export async function listSecurityIncidentReportsForProfile(profileId: string): Promise<{ id: string; incidentType: string; status: string; reportedAt: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("security_incident_reports").select("id, incident_type, status, reported_at").eq("profile_id", profileId).order("reported_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load security_incident_reports", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, incidentType: r.incident_type, status: r.status, reportedAt: r.reported_at }));
}
