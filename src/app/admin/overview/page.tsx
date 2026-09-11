import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  getOverviewStats,
  getGeneralNeedsAttention,
  getPayablesNeedsAttention,
  getOnboardingNeedsAttention,
  getRecentActivityForOverview,
} from "@/lib/admin/overview";
import ActiveUsersPanel from "@/components/admin/ActiveUsersPanel";

export const metadata: Metadata = {
  title: "Overview — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Phase K.3 (2026-09-06) — extended with the real Payables/External
// Workforce/files/organizational-operations action types now in
// production use (see src/lib/payables/*, src/lib/payments/*,
// src/lib/organization/*). This is the SAME mechanism the pre-existing
// entries already used — not a second labelling system — and it stays
// the single source of truth for this feed's human-readable text.
const ACTION_LABELS: Record<string, string> = {
  "role.grant": "Granted a role",
  "user.temporary_password_set": "Set a temporary password for account recovery",
  "role.revoke": "Revoked a role",
  "enquiry.stage_change": "Changed enquiry stage",
  "enquiry.note_added": "Added an enquiry note",
  "flag.toggle": "Toggled a feature flag",
  "booking.status_change": "Changed booking status",

  // Universal Payables (payment obligations, instructions, evidence, line items)
  "payment_obligation.destination_selected": "Selected a payout destination",
  "payment_instruction.created": "Added a payment instruction",
  "payment_instruction.verified": "Verified a payment instruction",
  "payment_instruction.verification_rejected": "Rejected a payment instruction verification",
  "payment_instruction.updated": "Updated a payment instruction",
  "payment_instruction.reactivated": "Reactivated a payment instruction",
  "payment_instruction.deactivated": "Deactivated a payment instruction",
  "payment_evidence.added": "Added payment evidence",
  "payable_item.added": "Added a payable line item",

  // External Workforce (engagements, payee profiles)
  "engagement.created": "Created an engagement",
  "engagement.updated": "Updated an engagement",
  "engagement.status_changed": "Changed engagement status",
  "payee_profile.created": "Created a payee profile",
  "payee_profile.status_changed": "Changed payee profile status",

  // Project files
  "project_file.uploaded": "Uploaded a project file",
  "project_file.backup_confirmed": "Confirmed a file backup",
  "project_file.retain_set": "Set a file to retain",
  "project_file.promoted_final_approved": "Approved a final deliverable",
  "project_file.purge_run": "Ran a file purge",

  // Organizational operations
  "department_request.created": "Submitted a department request",
  "department_request.decided": "Decided a department request",
  "department_request.comment_added": "Commented on a department request",
  "corporate_identity.reserved": "Reserved a corporate identity",
  "corporate_identity.status_changed": "Changed corporate identity status",
  "staff_onboarding.started": "Started staff onboarding",
  "staff_onboarding.completed": "Completed staff onboarding",
  "position.changed": "Changed a position assignment",
  "position.assigned": "Assigned a position",
  "position.created": "Created a position",
  "position.toggled": "Toggled a position",
  "grade.auto_resolved": "Auto-resolved a grade",
  "manager.auto_resolved": "Auto-resolved a manager",
  "department.created": "Created a department",
  "department.toggled": "Toggled a department",
  "member_number.assign": "Assigned a member number",
  "executive_admin.grant": "Granted executive admin authority",
  "department_admin.grant": "Granted department admin authority",
  "delegation.create": "Created a delegation",
  "delegation.revoke": "Revoked a delegation",
  "project_assignment.assigned": "Assigned a project",
  "project_assignment.status_change": "Changed project assignment status",

  // Pricing Engine V1 (2026-09-06)
  "pricing.personal_session_rate.created": "Updated a personal session rate",
  "pricing.market.active_changed": "Changed a pricing market's active state",
  "pricing.discount_code.created": "Created a discount code",
  "pricing.discount_code.active_changed": "Changed a discount code's active state",

  // Pricing Engine V1.1 (2026-09-06)
  "pricing.subject_category_multiplier.created": "Updated a subject/group price multiplier",
  "pricing.additional_retouch_rate.created": "Updated an additional retouch rate",
  "pricing.manual_discount.applied": "Applied a manual discount",

  // Corporate & Headshots Pricing V1 (2026-09-06)
  "pricing.corporate_headshot_rate.created": "Updated a Corporate Headshots rate",
  "pricing.corporate_team_tier_rate.created": "Updated a Team Headshots tier rate",
  "pricing.corporate_minimum_booking.created": "Updated a Corporate minimum booking amount",
  "pricing.corporate_retouch_rate.created": "Updated a Corporate additional retouch rate",
  "pricing.corporate_priority_delivery.created": "Updated a Corporate Priority Delivery percentage",

  // Weddings & Events Pricing V1 (2026-09-06)
  "pricing.wedding_event_tier_rate.created": "Updated a Wedding/Event collection rate",
  "pricing.wedding_event_priority_delivery.created": "Updated a Wedding/Event Priority Delivery percentage",
  "pricing.wedding_event_addon_rate.created": "Updated a Wedding/Event add-on rate",
  "pricing.wedding_event_percentage_rate.created": "Updated a Wedding/Event formula percentage",

  // Commercial & Advertising Pricing V1 (2026-09-07)
  "pricing.commercial_creative_fee_rate.created": "Updated a Commercial creative fee rate",
  "pricing.commercial_catalogue_base_rate.created": "Updated a Commercial catalogue base rate",
  "pricing.commercial_catalogue_minimum.created": "Updated a Commercial catalogue minimum",
  "pricing.commercial_postproduction_rate.created": "Updated a Commercial post-production rate",
  "pricing.commercial_percentage.created": "Updated a Commercial formula percentage",
  "pricing.commercial_licensing_factor.created": "Updated a Commercial licensing factor",
  "pricing.commercial_review_threshold.created": "Updated a Commercial review threshold",

  // Graphic Design Pricing V1 (2026-09-07)
  "pricing.graphic_design_deliverable_rate.created": "Updated a Graphic Design deliverable rate",
  "pricing.graphic_design_complexity_factor.created": "Updated a Graphic Design complexity factor",
  "pricing.graphic_design_addon_rate.created": "Updated a Graphic Design add-on rate",
  "pricing.graphic_design_percentage.created": "Updated a Graphic Design formula percentage",

  // Content Creation Pricing V1 (2026-09-07)
  "pricing.content_creation_package_rate.created": "Updated a Content Creation package rate",
  "pricing.content_creation_retainer_rate.created": "Updated a Content Creation retainer rate",
  "pricing.content_creation_addon_rate.created": "Updated a Content Creation add-on rate",
  "pricing.content_creation_percentage.created": "Updated a Content Creation formula percentage",

  // Discount Lifecycle Refinement (2026-09-07)
  "pricing.discount_code.deleted": "Permanently deleted an unused discount code",
  "pricing.discount_code.archived": "Archived/retired a discount code with redemption history",

  // Branding & Creative Strategy Pricing V1 (2026-09-07)
  "pricing.branding_tier_rate.created": "Updated a Branding service-level rate",
  "pricing.branding_revision_minimum.created": "Updated a Branding revision minimum",
  "pricing.branding_percentage.created": "Updated a Branding formula percentage",

  // Production Services Pricing V1 (2026-09-07)
  "pricing.production_market_rate.created": "Updated a Production Services rate",
  "pricing.production_percentage.created": "Updated a Production Services formula percentage",
  "production.supplier.created": "Added a production supplier",
  "production.supplier.active_changed": "Changed a production supplier's active state",
  "production.supplier.updated": "Updated a production supplier's details",
  "production.supplier_quote.created": "Recorded a production supplier quote",
  "production.supplier_quote.status_changed": "Changed a production supplier quote's status",
  "production.budget_version.created": "Created a new production budget version",
  "production.budget_change.approval_status_changed": "Changed a production budget change's client-approval status",

  // Partnerships & Collaborations V1 (2026-09-07)
  "partnerships.opportunity.created": "Created a partnership opportunity",
  "partnerships.opportunity.status_changed": "Changed a partnership opportunity's status",
  "partnerships.value_assessment.created": "Recorded a partnership value assessment",
  "partnerships.value_assessment.class_b_exceeds_threshold": "Flagged a Class B value assessment above the 50%-of-NCV threshold",
  "partnerships.concession.approved": "Approved a partnership concession",
  "partnerships.concession.rejected": "Rejected a partnership concession",
  "partnerships.strategic_assessment.created": "Recorded a partnership strategic score",
  "partnerships.agreement.created": "Created/amended a partnership agreement",
  "partnerships.referral.rate_set": "Set partnership referral commission terms",
  "partnerships.referral.approved": "Approved partnership referral terms",
  "partnerships.referral_lead.created": "Recorded a partnership referral lead",
  "partnerships.referral_lead.disputed": "Disputed a partnership referral lead",
  "partnerships.referral_commission.calculated": "Calculated a partnership referral commission",
  "partnerships.referral_commission.status_changed": "Changed a partnership referral commission's status",
  "partnerships.outcome_review.created": "Recorded a partnership outcome review",

  // Referral Payable Bridge (2026-09-07)
  "partnerships.opportunity.payee_linked": "Linked a partnership opportunity to a payee profile",
  "partnerships.referral_commission.payment_blocked": "Blocked a referral commission from being submitted to Payables",
  "partnerships.referral_commission.payables_submission_failed": "A referral commission's Payables submission failed",
  "partnerships.referral_commission.approved_for_payment": "Approved a referral commission for payment (submitted to Payables)",

  // Organizational Structure, Authority Grants, Onboarding & Work Email V1 (2026-09-07)
  "financial_authority_level.grant": "Granted a standing Financial Authority Level",
  "acting_assignment.created": "Created a temporary acting assignment",
  "acting_assignment.ended_early": "Ended an acting assignment early",
  "background_screening.recorded": "Recorded a background screening decision",
  "corporate_identity.local_part_requested": "Requested an alternative work-email local part",
  "corporate_identity.local_part_approved": "Approved a work-email local part request",
  "break_glass.invoked": "Invoked Super Admin emergency (break-glass) access",
  "staff_details.employment_status_changed": "Changed a person's employment status",
  "profiles.access_status_changed": "Changed a person's account/system access status",

  // Ordift Studios Legal Suite — LEGAL-SYS-1 (2026-09-08)
  "legal.master_version.status_changed": "Changed a legal document master version's lifecycle status",
  "legal.master_release.ingested": "Ingested a controlled Legal Suite Official Master release",
  "legal.agreement.draft_created": "Created a draft legal agreement",
  "legal.agreement.status_changed": "Changed an agreement's lifecycle status",
  "legal.agreement.snapshot_attached": "Attached a commercial/legal snapshot to an agreement",
  "legal.agreement.amendment_created": "Recorded an amendment to an issued agreement",
  "legal.agreement.issued_document_hash_recorded": "Recorded the issued-document hash for an agreement",
  "legal.signature_request.created": "Created a signature request",
  "legal.signature_signatory.link_generated": "Generated a signatory access link",
  "legal.signature_signatory.revoked": "Revoked a signatory's access",
  "legal.release.granted": "Granted a rights/release category on an agreement",

  // TALENT-SYS-1 Foundation (2026-09-08)
  "talent.profile.created": "Onboarded a new talent profile",
  "talent.representation.status_changed": "Changed a talent's representation status",
  "talent.category.created": "Created a talent category",
  "talent.category.assigned": "Assigned a talent category to a profile",
  "talent.category.removed": "Removed a talent category from a profile",
  "talent.commercial_terms.set": "Set a talent's commercial/commission terms",
  "talent.opportunity.created": "Created a talent opportunity",
  "talent.opportunity.status_changed": "Changed a talent opportunity's status",
  "talent.media.recorded": "Recorded a talent media asset",

  // Ordift Pulse (housekeeping fix, Adaptive Discovery Remediation,
  // 2026-09-08) — every real pulse.* action string in use, some
  // pre-existing and previously missing from this map, plus the new
  // hero-media/discovery-status ones added this phase.
  "pulse.article_publish": "Published a Pulse article",
  "pulse.article_reject": "Rejected a Pulse article",
  "pulse.article_archive": "Archived a Pulse article",
  "pulse.article_restore": "Restored a Pulse article",
  "pulse.source_updated": "Updated a Pulse source's configuration",
  "pulse.source_created": "Added a new Pulse source",
  "pulse.source_policy_checked": "Checked a Pulse source's policy page",
  "pulse.source_policy_url_adopted": "Adopted a discovered Policy/Rights URL for a Pulse source",
  "pulse.discovery_run": "Ran Pulse discovery for a source",
  "pulse.discovery_run_started": "Started a Pulse discovery run",
  "pulse.hero_media_uploaded": "Uploaded a Pulse hero media image",
  "pulse.hero_media_set": "Set a Pulse article's hero media",
  "pulse.hero_media_cleared": "Cleared a Pulse article's hero media",
};

// Graceful fallback for any action type not (yet) in ACTION_LABELS — pure
// string formatting, cannot throw, and never leaks a raw dotted/snake_case
// string to the screen. "project_file.purge_run" -> "Project File – Purge Run".
function humanizeAction(action: string): string {
  return action
    .split(".")
    .map((segment) =>
      segment
        .split("_")
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ")
    )
    .join(" – ");
}

function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? humanizeAction(action);
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-black/10 bg-white p-6 hover:border-black/25 transition-colors"
    >
      <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">{label}</p>
      <p className="font-serif font-medium text-section-heading text-ordift-ink">{value}</p>
    </Link>
  );
}

type AttentionItem = { label: string; count: number; href: string };

function AttentionCard({ item }: { item: AttentionItem }) {
  return (
    <Link
      href={item.href}
      className="block rounded-xl border border-ordift-gold-pressed/40 bg-ordift-gold-pressed/5 p-5 hover:border-ordift-gold-pressed transition-colors"
    >
      <p className="font-serif font-medium text-card-title text-ordift-ink">{item.count}</p>
      <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{item.label}</p>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const user = await getCurrentUser();

  const [stats, activity, general, payables, onboardingAttention] = await Promise.all([
    getOverviewStats(),
    getRecentActivityForOverview(),
    getGeneralNeedsAttention(),
    user ? getPayablesNeedsAttention(user.id) : Promise.resolve(null),
    user ? getOnboardingNeedsAttention(user.id) : Promise.resolve(null),
  ]);

  // "Needs Attention" — every entry here reuses an existing, already-filterable
  // screen and an already-real status/stage; nothing here is a new workflow
  // state. Items with a zero count are omitted rather than shown as "0" —
  // a zero isn't something to act on.
  const attentionItems: AttentionItem[] = [];
  if (general.newLeadEnquiries > 0) {
    attentionItems.push({
      label: "New leads awaiting triage",
      count: general.newLeadEnquiries,
      href: "/admin/enquiries?stage=new_lead",
    });
  }
  if (general.pendingPaymentRegistrations > 0) {
    attentionItems.push({
      label: "Workshop registrations awaiting payment",
      count: general.pendingPaymentRegistrations,
      href: "/admin/bookings?paymentStatus=Pending",
    });
  }
  if (payables) {
    if (payables.pendingApprovalCount > 0) {
      attentionItems.push({
        label: "Payables pending approval",
        count: payables.pendingApprovalCount,
        href: "/admin/payables?status=pending_approval",
      });
    }
    if (payables.approvedAwaitingPaymentCount > 0) {
      attentionItems.push({
        label: "Payables approved, awaiting payment recording",
        count: payables.approvedAwaitingPaymentCount,
        href: "/admin/payables?status=approved",
      });
    }
    if (payables.overdueEngagements.length > 0) {
      attentionItems.push({
        label: "Overdue engagements",
        count: payables.overdueEngagements.length,
        href: "#due-engagements",
      });
    }
    if (payables.filesAwaitingBackup.length > 0) {
      attentionItems.push({
        label: "Files awaiting backup confirmation",
        count: payables.filesAwaitingBackup.length,
        href: "#files-awaiting-backup",
      });
    }
  }
  // E.5 Stage 2I, Part F — one card per onboarding record genuinely
  // awaiting an approval-type requirement, each linking straight to
  // its own workspace (not an aggregate count) so the Founder can act
  // on the specific person, not just see a number.
  if (onboardingAttention) {
    for (const item of onboardingAttention.awaitingApproval) {
      attentionItems.push({
        label: `${item.profileName ?? "Onboarding"} — awaiting approval (${item.requirementLabels.join(", ")})`,
        count: 1,
        href: `/admin/organization/onboarding/${item.onboardingId}`,
      });
    }
  }

  return (
    <div className="space-y-12">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Overview
        </h1>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="New Enquiries (7 days)" value={stats.newEnquiriesThisWeek} href="/admin/enquiries" />
        <StatCard label="Open Workshops" value={stats.openWorkshopsCount} href="/admin/bookings" />
        <StatCard
          label="Pending Model Applications"
          value={stats.pendingModelApplications}
          href="/admin/users"
        />
        <StatCard
          label="Pending Vendor Applications"
          value={stats.pendingVendorApplications}
          href="/admin/users"
        />
      </section>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Needs Attention</h2>
        {attentionItems.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Nothing needs attention right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {attentionItems.map((item) => (
              <AttentionCard key={item.label} item={item} />
            ))}
          </div>
        )}
      </section>

      <ActiveUsersPanel />

      {payables && (
        <section>
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Payables Summary</h2>
          {payables.payableStatusCounts.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No payables recorded yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {payables.payableStatusCounts.map((row) => (
                <Link
                  key={row.status}
                  href={`/admin/payables?status=${row.status}`}
                  className="block rounded-xl border border-black/10 bg-white p-4 hover:border-black/25 transition-colors"
                >
                  <p className="font-sans text-caption text-ordift-ink-muted">{row.label}</p>
                  <p className="font-serif text-card-title text-ordift-ink mt-1">{row.count}</p>
                </Link>
              ))}
            </div>
          )}
          <p className="font-sans text-caption text-ordift-ink-muted mt-3">
            <Link href="/admin/payables" className="underline">
              View all payables →
            </Link>
          </p>
        </section>
      )}

      {payables && (payables.overdueEngagements.length > 0 || payables.dueSoonEngagements.length > 0) && (
        <section id="due-engagements">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Due &amp; Overdue Engagements</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-4">
            &ldquo;Due soon&rdquo; means a due date within the next 7 days.
          </p>
          <div className="space-y-6">
            {payables.overdueEngagements.length > 0 && (
              <div>
                <h3 className="font-sans font-semibold text-body-small text-red-700 mb-2">Overdue</h3>
                <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
                  {payables.overdueEngagements.map((e) => (
                    <div key={e.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div>
                        {e.payeeProfileId ? (
                          <Link href={`/admin/payables/payees/${e.payeeProfileId}`} className="font-sans text-body-small text-ordift-ink underline">
                            {e.payeeName ?? "Unnamed payee"}
                          </Link>
                        ) : (
                          <p className="font-sans text-body-small text-ordift-ink">{e.payeeName ?? "Unnamed payee"}</p>
                        )}
                        <p className="font-sans text-caption text-ordift-ink-muted">{e.operationalTitleName ?? "—"}</p>
                      </div>
                      <p className="font-sans text-caption text-red-700 whitespace-nowrap">Due {formatDate(e.dueDate)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {payables.dueSoonEngagements.length > 0 && (
              <div>
                <h3 className="font-sans font-semibold text-body-small text-ordift-ink-muted mb-2">Due Soon</h3>
                <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
                  {payables.dueSoonEngagements.map((e) => (
                    <div key={e.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div>
                        {e.payeeProfileId ? (
                          <Link href={`/admin/payables/payees/${e.payeeProfileId}`} className="font-sans text-body-small text-ordift-ink underline">
                            {e.payeeName ?? "Unnamed payee"}
                          </Link>
                        ) : (
                          <p className="font-sans text-body-small text-ordift-ink">{e.payeeName ?? "Unnamed payee"}</p>
                        )}
                        <p className="font-sans text-caption text-ordift-ink-muted">{e.operationalTitleName ?? "—"}</p>
                      </div>
                      <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">Due {formatDate(e.dueDate)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {payables && payables.filesAwaitingBackup.length > 0 && (
        <section id="files-awaiting-backup">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Files Awaiting Backup Confirmation</h2>
          <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
            {payables.filesAwaitingBackup.map((f) => (
              <Link
                key={f.id}
                href={`/admin/payables/engagements/${f.engagementId}/media`}
                className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-black/[0.02]"
              >
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">{f.originalFilename}</p>
                  <p className="font-sans text-caption text-ordift-ink-muted">{f.payeeName ?? "Unknown payee"}</p>
                </div>
                <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">{f.fileKind}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No activity recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
            {activity.map((entry) => (
              <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">
                    {labelForAction(entry.action)}
                    {entry.entityLabel ? ` — ${entry.entityLabel}` : ""}
                  </p>
                  {entry.actorName && (
                    <p className="font-sans text-caption text-ordift-ink-muted">{entry.actorName}</p>
                  )}
                </div>
                <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
