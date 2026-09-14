import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 9 (2026-09-14) —
// assets and equipment, OS-HR-GH-005 section 4. No numeric formula
// exists in this section of the controlled document, so this module
// carries no pure/computed functions — every function here records a
// human-supplied fact or decision, matching this codebase's established
// convention for sections with no formula to compute (see grievances.ts).

async function canManageAssets(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export async function registerAsset(params: {
  assetIdentifier: string;
  description: string;
  category?: string | null;
  accessories?: string[];
  acknowledgementRequired?: boolean;
  actorUserId: string;
}): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  if (!(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to register a company asset." };
  }
  if (!params.assetIdentifier.trim()) return { ok: false, error: "An asset identifier is required." };
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_assets")
    .insert({
      asset_identifier: params.assetIdentifier,
      description: params.description,
      category: params.category ?? null,
      accessories: params.accessories ?? [],
      acknowledgement_required: params.acknowledgementRequired ?? false,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "An asset with this identifier already exists." };
    return { ok: false, error: error?.message ?? "Failed to register the asset." };
  }
  return { ok: true, assetId: data.id };
}

// Requires the asset to currently be in_stock — the atomic
// .eq('status','in_stock') guard prevents assigning an already-assigned
// asset twice.
export async function assignAsset(params: {
  assetId: string;
  profileId: string;
  issueCondition?: string | null;
  issueAccessories?: string[] | null;
  acknowledgementRequired?: boolean;
  actorUserId: string;
}): Promise<{ ok: true; assignmentId: string } | { ok: false; error: string }> {
  if (!(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to assign a company asset." };
  }

  const admin = createAdminClient();
  const { data: asset } = await admin.from("company_assets").select("id, status, acknowledgement_required").eq("id", params.assetId).maybeSingle();
  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.status !== "in_stock") return { ok: false, error: `Cannot assign an asset currently in status "${asset.status}".` };

  const { data, error } = await admin
    .from("asset_assignments")
    .insert({
      asset_id: params.assetId,
      profile_id: params.profileId,
      issued_by: params.actorUserId,
      issue_condition: params.issueCondition ?? null,
      issue_accessories: params.issueAccessories ?? null,
      acknowledgement_required: params.acknowledgementRequired ?? asset.acknowledgement_required,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the asset assignment." };

  await admin.from("company_assets").update({ status: "assigned" }).eq("id", params.assetId).eq("status", "in_stock");

  await logActivity({ actorUserId: params.actorUserId, action: "asset_assignment.issued", entityType: "user", entityId: params.profileId, metadata: { assignmentId: data.id, assetId: params.assetId } });
  return { ok: true, assignmentId: data.id };
}

// Self-acknowledgement is normal (the assignee digitally acknowledges
// their own equipment); an admin may also record it on their behalf.
export async function acknowledgeAssetAssignment(params: { assignmentId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("asset_assignments").select("id, profile_id, acknowledgement_required, acknowledged_at").eq("id", params.assignmentId).maybeSingle();
  if (!existing) return { ok: false, error: "Assignment not found." };

  const isSelf = params.actorUserId === existing.profile_id;
  if (!isSelf && !(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to acknowledge this assignment on behalf of another person." };
  }
  if (!existing.acknowledgement_required) return { ok: false, error: "This assignment does not require acknowledgement." };
  if (existing.acknowledged_at) return { ok: false, error: "This assignment has already been acknowledged." };

  const { data, error } = await admin
    .from("asset_assignments")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", params.assignmentId)
    .is("acknowledged_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the acknowledgement." };
  if (!data) return { ok: false, error: "This assignment has already been acknowledged." };

  await logActivity({ actorUserId: params.actorUserId, action: "asset_assignment.acknowledged", entityType: "asset_assignment", entityId: params.assignmentId });
  return { ok: true };
}

// Returns the asset to in_stock — a repair/retirement/disposal
// determination is a separate decision, made via updateAssetStatus(),
// never inferred automatically from a return.
export async function returnAsset(params: { assignmentId: string; returnCondition: string; returnAccessories?: string[] | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record an asset return." };
  }
  if (!params.returnCondition.trim()) return { ok: false, error: "The return condition must be documented." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("asset_assignments").select("id, asset_id, profile_id, status").eq("id", params.assignmentId).maybeSingle();
  if (!existing) return { ok: false, error: "Assignment not found." };
  if (existing.status !== "issued") return { ok: false, error: `Cannot return an assignment already in status "${existing.status}".` };

  const { data, error } = await admin
    .from("asset_assignments")
    .update({ status: "returned", returned_at: new Date().toISOString(), return_condition: params.returnCondition, return_accessories: params.returnAccessories ?? null, return_recorded_by: params.actorUserId })
    .eq("id", params.assignmentId)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the return." };
  if (!data) return { ok: false, error: "The assignment changed concurrently — please retry." };

  await admin.from("company_assets").update({ status: "in_stock" }).eq("id", existing.asset_id).eq("status", "assigned");

  await logActivity({ actorUserId: params.actorUserId, action: "asset_assignment.returned", entityType: "user", entityId: existing.profile_id, metadata: { assignmentId: params.assignmentId } });
  return { ok: true };
}

// Ends the current assignment (status='transferred') and creates a new
// one for the receiving person, linked via transfer_from_assignment_id
// — the real 4.1 "transfer record" requirement, without a separate
// transfer-log table.
export async function transferAsset(params: { assignmentId: string; newProfileId: string; transferCondition?: string | null; actorUserId: string }): Promise<{ ok: true; newAssignmentId: string } | { ok: false; error: string }> {
  if (!(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to transfer a company asset." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("asset_assignments").select("id, asset_id, status, acknowledgement_required").eq("id", params.assignmentId).maybeSingle();
  if (!existing) return { ok: false, error: "Assignment not found." };
  if (existing.status !== "issued") return { ok: false, error: `Cannot transfer an assignment already in status "${existing.status}".` };

  const { data: ended } = await admin
    .from("asset_assignments")
    .update({ status: "transferred", returned_at: new Date().toISOString(), return_condition: params.transferCondition ?? null, return_recorded_by: params.actorUserId })
    .eq("id", params.assignmentId)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();
  if (!ended) return { ok: false, error: "The assignment changed concurrently — please retry." };

  const { data: newAssignment, error } = await admin
    .from("asset_assignments")
    .insert({
      asset_id: existing.asset_id,
      profile_id: params.newProfileId,
      issued_by: params.actorUserId,
      issue_condition: params.transferCondition ?? null,
      acknowledgement_required: existing.acknowledgement_required,
      transfer_from_assignment_id: params.assignmentId,
    })
    .select("id")
    .single();
  if (error || !newAssignment) return { ok: false, error: error?.message ?? "Failed to record the transfer." };

  await logActivity({ actorUserId: params.actorUserId, action: "asset_assignment.transferred", entityType: "user", entityId: params.newProfileId, metadata: { fromAssignmentId: params.assignmentId, newAssignmentId: newAssignment.id } });
  return { ok: true, newAssignmentId: newAssignment.id };
}

export type AssetStatus = "in_stock" | "under_repair" | "retired" | "disposed";

export async function updateAssetStatus(params: { assetId: string; status: AssetStatus; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to update an asset's status." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("company_assets").update({ status: params.status }).eq("id", params.assetId).neq("status", "assigned");
  if (error) return { ok: false, error: "Failed to update the asset status." };
  return { ok: true };
}

// Self-reporting is normal (4.2: "Employees exercise reasonable care
// and report loss/damage"); an admin may also report on someone's
// behalf.
export async function reportAssetIncident(params: { assignmentId: string; profileId: string; incidentType: string; description: string; actorUserId: string }): Promise<{ ok: true; incidentId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to report an asset incident on behalf of another person." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("asset_incident_reports")
    .insert({ asset_assignment_id: params.assignmentId, profile_id: params.profileId, reported_by: params.actorUserId, incident_type: params.incidentType, description: params.description })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to report the incident." };

  await logActivity({ actorUserId: params.actorUserId, action: "asset_incident.reported", entityType: "user", entityId: params.profileId, metadata: { incidentId: data.id, incidentType: params.incidentType } });
  return { ok: true, incidentId: data.id };
}

export type AssetIncidentDetermination = "company_matter" | "proven_deliberate_or_negligent";

// The determination itself is always a human judgment — this function
// never infers company_matter vs proven_deliberate_or_negligent from
// the incident_type or description. recoveryRequired/recoveryNotes
// only record that lawful recovery was determined appropriate; this
// function never itself creates a salary_advances or
// final_settlement_deductions row — "no automatic payroll deduction
// applies" (OS-HR-GH-005 4.2).
export async function determineAssetIncident(params: {
  incidentId: string;
  determination: AssetIncidentDetermination;
  determinationNotes: string;
  investigationId?: string | null;
  recoveryRequired?: boolean;
  recoveryNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageAssets(params.actorUserId))) {
    return { ok: false, error: "Not authorized to determine an asset incident." };
  }
  if (!params.determinationNotes.trim()) return { ok: false, error: "Determination notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("asset_incident_reports")
    .update({
      determination: params.determination,
      determination_notes: params.determinationNotes,
      investigation_id: params.investigationId ?? null,
      recovery_required: params.recoveryRequired ?? false,
      recovery_notes: params.recoveryNotes ?? null,
      determined_by: params.actorUserId,
      determined_at: new Date().toISOString(),
    })
    .eq("id", params.incidentId)
    .eq("determination", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the determination." };
  if (!data) return { ok: false, error: "Incident not found, or already determined." };

  await logActivity({ actorUserId: params.actorUserId, action: "asset_incident.determined", entityType: "asset_incident_report", entityId: params.incidentId, metadata: { determination: params.determination } });
  return { ok: true };
}

export async function listAssetAssignmentsForProfile(profileId: string): Promise<{ id: string; assetId: string; status: string; issuedAt: string; returnedAt: string | null }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("asset_assignments").select("id, asset_id, status, issued_at, returned_at").eq("profile_id", profileId).order("issued_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load asset_assignments", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, assetId: r.asset_id, status: r.status, issuedAt: r.issued_at, returnedAt: r.returned_at }));
}

// Read-only — surfaces outstanding (still-issued) assets for a person
// so an offboarding workflow can consult it. Deliberately not wired as
// a blocking gate anywhere in offboarding.ts: OS-HR-GH-006 4.4 is
// explicit that "Incomplete clearance cannot justify unlawful
// withholding of protected wages/entitlements," so this never blocks
// closeEmployment() — it only informs the clearance process (4.3:
// "Asset status feeds the offboarding clearance process").
export async function listOutstandingAssetAssignmentsForProfile(profileId: string): Promise<{ id: string; assetId: string; issuedAt: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("asset_assignments").select("id, asset_id, issued_at").eq("profile_id", profileId).eq("status", "issued").order("issued_at", { ascending: true });
  if (error) {
    console.error("[organization] failed to load outstanding asset_assignments", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, assetId: r.asset_id, issuedAt: r.issued_at }));
}
