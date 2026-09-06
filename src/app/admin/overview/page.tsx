import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  getOverviewStats,
  getGeneralNeedsAttention,
  getPayablesNeedsAttention,
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

  const [stats, activity, general, payables] = await Promise.all([
    getOverviewStats(),
    getRecentActivityForOverview(),
    getGeneralNeedsAttention(),
    user ? getPayablesNeedsAttention(user.id) : Promise.resolve(null),
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
