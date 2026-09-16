import { isSuperAdminId, hasAuthority, hasJurisdictionAuthority, authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { listPendingLeaveRequestsForReviewer } from "@/lib/organization/leaveRequests";
import { listSwapsAwaitingReviewerDecisionFor } from "@/lib/organization/leaveSwap";
import { listDepartmentRequests } from "@/lib/organization/departmentRequests";
import { canManageOnboarding, listStaffOnboarding } from "@/lib/organization/onboarding";
import { canManageAttendance, listUnexplainedAbsencesAcrossStaff } from "@/lib/organization/attendance";
import { listVendorProfiles } from "@/lib/vendors/vendorProfiles";
import { listLegalReviewQueue, listSignatureRequestsForAdmin } from "@/lib/legal/governanceOverview";
import { listAllPaymentObligations } from "@/lib/payments/payoutObligations";
import { canManageAssets, listAssetIncidentsAwaitingDetermination } from "@/lib/organization/assets";
import { canManageBusinessTravel, listBusinessTravelAuthorizationsAwaitingApproval } from "@/lib/organization/businessTravel";
import { listSafeguardingConcernReports } from "@/lib/organization/safeguarding";

// Super Admin "Needs My Approval / Action" centre (2026-09-16) — a READ
// aggregation over items each governed workflow already knows how to
// list; this module never introduces a new approval concept or writes
// anything. Every item links back to the SAME existing page that
// already performs the real decision — this is a queue view, not a new
// decision surface. An item only appears for an actor who genuinely
// holds the authority the underlying action already requires — the
// same gate the action itself enforces, checked again here purely for
// display scoping (never the actual authorization boundary, which each
// action function still enforces independently at the point of write).
//
// Client Quotations are deliberately absent: the domain has no
// internal-approval concept at all (draft → sent is the creator's own
// action; sent → accepted/declined is the CLIENT's decision, not an
// admin approval) — see clientQuotations.ts's VALID_STATUS_TRANSITIONS.
export type ApprovalDomain =
  | "leave"
  | "leave_swap"
  | "department_request"
  | "onboarding"
  | "attendance"
  | "vendor"
  | "agreement_review"
  | "agreement_signature"
  | "payable"
  | "asset_incident"
  | "business_travel"
  | "safeguarding";

export type NeedsMyApprovalItem = {
  domain: ApprovalDomain;
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
};

const ONBOARDING_APPROVAL_STAGE: Record<string, string[]> = {
  employee: ["preliminary_approval", "management_review"],
  external_contractor: ["proposed"],
};

export async function listNeedsMyApprovalItems(actorUserId: string): Promise<NeedsMyApprovalItem[]> {
  const items: NeedsMyApprovalItem[] = [];

  const [
    leaveRequests,
    leaveSwaps,
    isRecruitmentAdmin,
    isOperationsAdmin,
    canOnboarding,
    canAttendance,
    canAssets,
    canTravel,
    safeguardingReports,
  ] = await Promise.all([
    listPendingLeaveRequestsForReviewer(actorUserId),
    listSwapsAwaitingReviewerDecisionFor(actorUserId),
    hasAuthority(actorUserId, PEOPLE_CAPABILITIES.recruitmentAdminister, null),
    hasJurisdictionAuthority(actorUserId, "operations", "administer"),
    canManageOnboarding(actorUserId),
    canManageAttendance(actorUserId),
    canManageAssets(actorUserId),
    canManageBusinessTravel(actorUserId),
    listSafeguardingConcernReports(actorUserId),
  ]);

  for (const r of leaveRequests) {
    items.push({
      domain: "leave",
      id: r.id,
      title: `Leave request — ${r.profileFullName ?? "Unknown"}`,
      subtitle: `${r.startDate} → ${r.endDate} (${r.daysRequested} day${r.daysRequested === 1 ? "" : "s"})`,
      createdAt: r.createdAt,
      href: "/admin/organization/leave",
    });
  }

  for (const s of leaveSwaps) {
    items.push({
      domain: "leave_swap",
      id: s.id,
      title: `Leave swap — ${s.initiatorFullName ?? "Unknown"} ↔ ${s.counterpartFullName ?? "Unknown"}`,
      subtitle: "Counterpart accepted — awaiting your review",
      createdAt: s.createdAt,
      href: "/admin/organization/leave",
    });
  }

  if (isRecruitmentAdmin || isOperationsAdmin) {
    const requests = await listDepartmentRequests();
    for (const req of requests) {
      if (req.status !== "submitted") continue;
      if (req.requestType === "requisition" && !isRecruitmentAdmin) continue;
      if (req.requestType !== "requisition" && !isOperationsAdmin) continue;
      items.push({
        domain: "department_request",
        id: req.id,
        title: `${req.requestType === "requisition" ? "Requisition" : "Department request"} — ${req.title}`,
        subtitle: `${req.requestingDepartmentName ?? "—"} · ${req.referenceNumber ?? "—"}`,
        createdAt: req.createdAt,
        href: "/admin/operations",
      });
    }
  }

  if (canOnboarding) {
    const onboarding = await listStaffOnboarding();
    for (const o of onboarding) {
      const stagesAwaitingAction = ONBOARDING_APPROVAL_STAGE[o.pipeline] ?? [];
      if (!stagesAwaitingAction.includes(o.stage)) continue;
      items.push({
        domain: "onboarding",
        id: o.id,
        title: `Onboarding awaiting action — ${o.pipeline === "employee" ? "Staff" : "External workforce"}`,
        subtitle: `Stage: ${o.stage.replace(/_/g, " ")}`,
        createdAt: o.createdAt,
        href: `/admin/organization/onboarding/${o.id}`,
      });
    }

    const vendors = await listVendorProfiles(actorUserId);
    for (const v of vendors) {
      if (v.status !== "pending") continue;
      items.push({
        domain: "vendor",
        id: v.id,
        title: `Vendor approval — ${v.companyName ?? v.fullName ?? "Unnamed vendor"}`,
        subtitle: "Awaiting Approved Vendor Pool decision",
        createdAt: v.createdAt,
        href: `/admin/organization/vendors/${v.id}`,
      });
    }
  }

  if (canAttendance) {
    const absences = await listUnexplainedAbsencesAcrossStaff();
    for (const a of absences) {
      items.push({
        domain: "attendance",
        id: a.id,
        title: `Unexplained absence — ${a.profileFullName ?? "Unknown"}`,
        subtitle: `${a.attendanceDate}`,
        createdAt: a.attendanceDate,
        href: "/admin/organization/attendance",
      });
    }
  }

  // Legal review queue + open signature requests — same authorization
  // boundary as /admin/legal itself (Admin or Super Admin).
  if (await isSuperAdminId(actorUserId)) {
    const [reviewQueue, signatureRequests] = await Promise.all([listLegalReviewQueue(), listSignatureRequestsForAdmin()]);
    for (const a of reviewQueue) {
      items.push({
        domain: "agreement_review",
        id: a.id,
        title: `Jurisdiction review — ${a.masterTitle ?? a.agreementReference}`,
        subtitle: `${a.agreementReference} · ${a.jurisdiction ?? "—"}`,
        createdAt: a.createdAt,
        href: `/admin/organization/agreements/${a.id}`,
      });
    }
    for (const s of signatureRequests) {
      if (s.signedCount >= s.signatoryCount) continue;
      items.push({
        domain: "agreement_signature",
        id: s.agreementId,
        title: `Signature outstanding — ${s.agreementReference}`,
        subtitle: `${s.signedCount} of ${s.signatoryCount} signed`,
        createdAt: s.createdAt,
        href: `/admin/organization/agreements/${s.agreementId}`,
      });
    }
  }

  const payableAuth = await authorizeWithSuperAdminOverride(actorUserId, FINANCE_CAPABILITIES.paymentObligationApprove);
  if (payableAuth.ok) {
    const obligations = await listAllPaymentObligations();
    for (const o of obligations) {
      if (o.status !== "pending_approval") continue;
      items.push({
        domain: "payable",
        id: o.id,
        title: `Payable approval — ${o.description ?? o.sourceReference ?? o.id}`,
        subtitle: `${o.currency} ${o.amount.toFixed(2)}`,
        createdAt: o.createdAt,
        href: `/admin/payables/${o.id}`,
      });
    }
  }

  if (canAssets) {
    const incidents = await listAssetIncidentsAwaitingDetermination();
    for (const i of incidents) {
      items.push({
        domain: "asset_incident",
        id: i.id,
        title: `Asset incident — ${i.profileFullName ?? "Unknown"}`,
        subtitle: i.incidentType,
        createdAt: i.reportedAt,
        href: `/admin/organization/people/${i.profileId}#section-assets`,
      });
    }
  }

  if (canTravel) {
    const travel = await listBusinessTravelAuthorizationsAwaitingApproval();
    for (const t of travel) {
      items.push({
        domain: "business_travel",
        id: t.id,
        title: `Business travel authorization — ${t.profileFullName ?? "Unknown"}`,
        subtitle: `${t.destinationCountry} · ${t.purpose}`,
        createdAt: t.createdAt,
        href: `/admin/organization/people/${t.profileId}#section-business-travel`,
      });
    }
  }

  // listSafeguardingConcernReports() self-gates on canManageSafeguarding
  // and returns [] for an unauthorized actor — no extra check needed.
  for (const s of safeguardingReports) {
    if (s.status !== "reported" && s.status !== "escalated") continue;
    items.push({
      domain: "safeguarding",
      id: s.id,
      title: "Safeguarding concern report",
      subtitle: s.status === "escalated" ? "Escalated — awaiting resolution" : "Reported — awaiting review",
      createdAt: s.reportedAt,
      href: "/admin/organization/safeguarding",
    });
  }

  return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
