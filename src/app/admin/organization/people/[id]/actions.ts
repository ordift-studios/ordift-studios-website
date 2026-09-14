"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { recordBackgroundScreening } from "@/lib/organization/backgroundScreening";
import { BACKGROUND_SCREENING_CATEGORIES, BACKGROUND_SCREENING_STATUSES } from "@/lib/organization/backgroundScreening";
import { updateAccessStatusAction } from "@/app/admin/users/actions";
import { createSeparationCase, SEPARATION_CATEGORIES, SEPARATION_REASON_TYPES, type SeparationCategory } from "@/lib/organization/separationCases";
import {
  recordPerformanceReview,
  initiatePip,
  recordPipCheckin,
  extendPip,
  decidePip,
  PIP_ALLOWED_DURATIONS_DAYS,
  type PipDurationDays,
  type PipOutcome,
} from "@/lib/organization/performanceReviews";
import {
  issueDisciplinaryAction,
  openInvestigation,
  closeInvestigation,
  recordInvestigatorySuspension,
  recordSuspensionReview,
  DISCIPLINARY_ACTION_TYPES,
  type DisciplinaryActionType,
  type InvestigationOutcome,
} from "@/lib/organization/discipline";

// Organizational Structure, Authority Grants, Onboarding & Work Email
// V1 (2026-09-07) — Person Detail View actions. Employment/engagement
// STATUS (this file) is deliberately separate from Account/System
// Access Status (src/app/admin/users/actions.ts's
// updateAccessStatusAction, reused unchanged by the page this powers —
// not duplicated here).
const EMPLOYMENT_STATUSES = ["pre_start", "active", "probation", "leave", "suspended", "notice_period", "exited"] as const;

// Security narrowing (2026-09-07) — same people.workforce.administer
// capability as /admin/users' own requireAdmin() (see
// src/app/admin/users/actions.ts) — this file edits the same
// Employment/Access Status workforce data, so it gets the identical
// boundary rather than a looser side door.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authorized.");
  const auth = await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workforceAdminister);
  if (!auth.ok) throw new Error("Not authorized.");
  return user;
}

export async function setEmploymentStatusAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!profileId || !(EMPLOYMENT_STATUSES as readonly string[]).includes(status)) return;

  const admin = createAdminClient();
  const { data: previous } = await admin.from("staff_details").select("employment_status").eq("id", profileId).maybeSingle();

  const { error } = await admin
    .from("staff_details")
    .update({
      employment_status: status,
      employment_status_changed_at: new Date().toISOString(),
      employment_status_changed_by: currentUser.id,
    })
    .eq("id", profileId);
  if (error) {
    console.error("[admin organization] failed to update employment_status", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "staff_details.employment_status_changed",
    entityType: "user",
    entityId: profileId,
    metadata: { previousStatus: previous?.employment_status ?? null, newStatus: status },
  });

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Background screening decision — recordBackgroundScreening() itself
// independently enforces Super-Admin-only; this action is just the
// form entry point.
export async function recordBackgroundScreeningAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim() || null;
  const evidenceReference = String(formData.get("evidenceReference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !(BACKGROUND_SCREENING_CATEGORIES as readonly string[]).includes(category)) return;
  if (!(BACKGROUND_SCREENING_STATUSES as readonly string[]).includes(status)) return;

  const result = await recordBackgroundScreening({
    profileId,
    category,
    status,
    jurisdiction,
    evidenceReference,
    notes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record background screening", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Thin wrapper so the existing updateAccessStatusAction (which returns
// {error?} for its own client-side ConfirmBar UX in UsersManager.tsx)
// can also be used directly as a plain <form action> here, which
// requires a void-returning action. No logic duplicated — the real
// function is called unmodified.
export async function updateAccessStatusFormAction(formData: FormData): Promise<void> {
  const result = await updateAccessStatusAction(formData);
  if (result.error) console.error("[admin organization] failed to update access status", result.error);
  const profileId = String(formData.get("userId") ?? "").trim();
  if (profileId) revalidatePath(`/admin/organization/people/${profileId}`);
}

// Workforce lifecycle — separation/offboarding entry point (E.5 Stage
// 2J, Part 5/9). This is the admin-invoked foundation only: every real
// call in this stage records initiatedByRole "company" honestly — no
// employee-facing self-service surface exists yet (deliberately
// deferred). createSeparationCase() itself never touches Position/
// Grade/roles/Authority/Corporate Identity/Workspace/payment; it only
// opens a case for the Clearance Workspace to act on. Authorization
// uses the same canManageSeparationCases() boundary as every other
// separation action, deliberately not this file's own
// PEOPLE_CAPABILITIES.workforceAdminister gate, so the whole
// separation feature shares one consistent authorization boundary.
export async function initiateSeparationCaseAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() as SeparationCategory;
  const reasonType = String(formData.get("reasonType") ?? "").trim();
  const reasonNotes = String(formData.get("reasonNotes") ?? "").trim() || null;
  const proposedLastWorkingDate = String(formData.get("proposedLastWorkingDate") ?? "").trim() || null;
  if (!profileId || !(SEPARATION_CATEGORIES as readonly string[]).includes(category)) return;
  if (!(SEPARATION_REASON_TYPES[category] as readonly string[]).includes(reasonType)) return;

  const result = await createSeparationCase({
    profileId,
    category,
    reasonType,
    reasonNotes,
    proposedLastWorkingDate,
    actorUserId: currentUser.id,
  });
  if (!result.ok) {
    console.error("[admin organization] failed to create separation case", result.error);
    return;
  }

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Performance Reviews / Performance Improvement Plans (Phase B5 Step 2,
// 2026-09-14) — consolidated onto the Employee Profile page rather than
// a separate top-level page (spec: "one coherent employee workspace").
// Authorization is enforced inside each lib function
// (canManagePerformance) exactly as the Separation forms above already
// rely on their own lib-level gate.
export async function recordPerformanceReviewAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const outcomeSummary = String(formData.get("outcomeSummary") ?? "").trim();
  const reviewPeriodStart = String(formData.get("reviewPeriodStart") ?? "").trim() || null;
  const reviewPeriodEnd = String(formData.get("reviewPeriodEnd") ?? "").trim() || null;
  const competencyNotes = String(formData.get("competencyNotes") ?? "").trim() || null;
  const kpiNotes = String(formData.get("kpiNotes") ?? "").trim() || null;
  if (!profileId || !outcomeSummary) return;

  const result = await recordPerformanceReview({
    profileId,
    reviewerId: currentUser.id,
    reviewPeriodStart,
    reviewPeriodEnd,
    competencyNotes,
    kpiNotes,
    outcomeSummary,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record performance review", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function initiatePipAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const deficientStandard = String(formData.get("deficientStandard") ?? "").trim();
  const requiredImprovement = String(formData.get("requiredImprovement") ?? "").trim();
  const measurableObjectives = String(formData.get("measurableObjectives") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const supportResources = String(formData.get("supportResources") ?? "").trim() || null;
  const durationRaw = Number(formData.get("plannedDurationDays") ?? "");
  const plannedDurationDays = (PIP_ALLOWED_DURATIONS_DAYS as readonly number[]).includes(durationRaw) ? (durationRaw as PipDurationDays) : undefined;
  if (!profileId || !deficientStandard || !requiredImprovement || measurableObjectives.length === 0) return;

  const result = await initiatePip({
    profileId,
    deficientStandard,
    requiredImprovement,
    measurableObjectives,
    supportResources,
    plannedDurationDays,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to initiate PIP", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordPipCheckinAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const pipId = String(formData.get("pipId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!profileId || !pipId || !notes) return;

  const result = await recordPipCheckin({ pipId, notes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record PIP check-in", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function extendPipAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const pipId = String(formData.get("pipId") ?? "").trim();
  const newEndDate = String(formData.get("newEndDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !pipId || !newEndDate || !reason) return;

  const result = await extendPip({ pipId, newEndDate, reason, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to extend PIP", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function decidePipAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const pipId = String(formData.get("pipId") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const outcomeNotes = String(formData.get("outcomeNotes") ?? "").trim();
  if (!profileId || !pipId || !outcomeNotes) return;
  if (outcome !== "completed_improved" && outcome !== "completed_failed_escalated") return;

  const result = await decidePip({ pipId, outcome: outcome as PipOutcome, outcomeNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decide PIP outcome", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Employee Relations — Discipline / Investigation (Phase B5 Step 3,
// 2026-09-14). The page itself restricts this section's visibility to
// Super Admin (same "restricted access, separate from performance"
// pattern already used for Background Screening on this page);
// issueDisciplinaryAction/openInvestigation/etc. carry their own
// independent authorization gate regardless.
export async function issueDisciplinaryActionAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const actionType = String(formData.get("actionType") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const incidentDate = String(formData.get("incidentDate") ?? "").trim() || null;
  const investigationId = String(formData.get("investigationId") ?? "").trim() || null;
  if (!profileId || !reason || !(DISCIPLINARY_ACTION_TYPES as readonly string[]).includes(actionType)) return;

  const result = await issueDisciplinaryAction({
    profileId,
    actionType: actionType as DisciplinaryActionType,
    reason,
    incidentDate,
    investigationId,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to issue disciplinary action", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function openInvestigationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !reason) return;

  const result = await openInvestigation({ profileId, reason, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to open investigation", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function closeInvestigationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const investigationId = String(formData.get("investigationId") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const outcomeNotes = String(formData.get("outcomeNotes") ?? "").trim() || null;
  const validOutcomes: InvestigationOutcome[] = ["closed_no_action", "closed_resulted_in_discipline", "closed_resulted_in_separation"];
  if (!profileId || !investigationId || !(validOutcomes as string[]).includes(outcome)) return;

  const result = await closeInvestigation({ investigationId, outcome: outcome as InvestigationOutcome, outcomeNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to close investigation", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordInvestigatorySuspensionAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const investigationId = String(formData.get("investigationId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const fullBasicPay = formData.get("fullBasicPay") !== "false";
  const normalBenefits = formData.get("normalBenefits") !== "false";
  const accessRestricted = formData.get("accessRestricted") === "true";
  if (!profileId || !investigationId || !reason) return;

  const result = await recordInvestigatorySuspension({ investigationId, profileId, reason, fullBasicPay, normalBenefits, accessRestricted, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record investigatory suspension", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordSuspensionReviewAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const suspensionId = String(formData.get("suspensionId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const nextReviewDueAt = String(formData.get("nextReviewDueAt") ?? "").trim() || null;
  if (!profileId || !suspensionId || (decision !== "continue_suspension" && decision !== "end_suspension")) return;

  const result = await recordSuspensionReview({ suspensionId, decision, notes, nextReviewDueAt, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record suspension review", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}
