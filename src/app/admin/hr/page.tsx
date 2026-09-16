import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getHrCommandCentreSummary } from "@/lib/organization/hrCommandCentre";

export const metadata: Metadata = {
  title: "HR / People — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// HR / People Hub (2026-09-16) — a coherent operational entry point
// over already-built HR/workforce modules, per explicit Human QA
// finding: the modules existed but Super Admin could not SEE a single
// obvious "HR" surface without guessing a route or searching under
// unrelated menus. Pure navigation — no new data model, no rebuilt
// module; every link below points at an existing, already-authorized
// route, which independently re-checks its own access on load.
type HubLink = { label: string; href: string; description: string };
type HubGroup = { label: string; links: HubLink[] };

const HUB_GROUPS: HubGroup[] = [
  {
    label: "Recruitment & Hiring",
    links: [
      { label: "Recruitment", href: "/admin/recruitment", description: "Applications, status, and the Accepted → Proceed to Hire bridge." },
      { label: "Users & Roles", href: "/admin/users", description: "Invite Collaborator, account/role/classification, and Proceed-to-Hire prefill." },
    ],
  },
  {
    label: "Employees & Workforce",
    links: [
      { label: "Workforce Overview", href: "/admin/organization/workforce", description: "The staff roster and current employment terms." },
      { label: "People Directory", href: "/admin/organization/people", description: "Card/list workforce directory with search and filters." },
      { label: "Organization Structure", href: "/admin/organization", description: "Departments and Positions (structural only)." },
      { label: "Legal Entities", href: "/admin/organization/legal-entities", description: "Employing entities for agreements and payroll." },
    ],
  },
  {
    label: "Attendance & Leave",
    links: [
      { label: "Attendance", href: "/admin/organization/attendance", description: "Weekly attendance and reconciliation." },
      { label: "Leave", href: "/admin/organization/leave", description: "Leave types, balances, requests, bidding, and swaps." },
    ],
  },
  {
    label: "Compensation & Benefits",
    links: [
      { label: "Compensation", href: "/admin/users", description: "Salary/compensation is recorded per person in Users & Roles." },
      { label: "My Compensation (self-service)", href: "/admin/me/compensation", description: "The employee self-service view of pay, advances, and benefits." },
    ],
  },
  {
    label: "Vendors & External Providers",
    links: [
      { label: "Vendors", href: "/admin/organization/vendors", description: "Onboarding, Vendor Approval, Engagements, and OS-LGL-009 agreements." },
    ],
  },
  {
    label: "Employee Relations & Safeguarding",
    links: [
      { label: "Employee Relations", href: "/admin/organization/employee-relations", description: "Grievances and related cases." },
      { label: "Safeguarding", href: "/admin/organization/safeguarding", description: "Safeguarding records." },
      { label: "Assets & Equipment", href: "/admin/organization/assets", description: "Staff-issued assets and equipment." },
    ],
  },
  {
    label: "Legal & Governance",
    links: [
      { label: "Legal & Governance", href: "/admin/legal", description: "Controlled legal document masters and versions, including HR/employment policy documents." },
    ],
  },
];

const KPI_CARDS: { key: keyof Awaited<ReturnType<typeof getHrCommandCentreSummary>>["summary"]; label: string; href: string }[] = [
  { key: "activeEmployees", label: "Active Employees", href: "/admin/organization/workforce" },
  { key: "externalWorkforce", label: "External Workforce", href: "/admin/organization/vendors" },
  { key: "newApplications", label: "New Applications", href: "/admin/recruitment" },
  { key: "acceptedAwaitingHire", label: "Accepted / Awaiting Hire", href: "/admin/recruitment" },
  { key: "onboardingInProgress", label: "Onboarding In Progress", href: "/admin/organization/workforce" },
  { key: "onLeaveToday", label: "On Leave Today", href: "/admin/organization/leave" },
  { key: "attendanceExceptions", label: "Attendance Exceptions", href: "/admin/organization/attendance" },
  { key: "pendingLeaveDecisions", label: "Pending HR Actions", href: "/admin/organization/leave" },
];

export default async function HrHubPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const { summary, needsAttention, pipeline, externalWorkforceByType, recentHires, recentActivity } = await getHrCommandCentreSummary();
  const EXTERNAL_TYPE_LABELS: Record<string, string> = {
    vendor: "Vendor / Supplier",
    contractor: "Contractor / Freelancer",
    model: "Model / Talent",
    workshop_participant: "Workshop Participant",
  };
  const ACTIVITY_LABELS: Record<string, string> = {
    "recruitment.status_changed": "Recruitment status changed",
    "recruitment_application.converted_to_vendor": "Application converted to vendor",
    "recruitment_requisition.founder_direct_hire_created": "Founder Direct Hire requisition created",
    "recruitment_requisition.standard_hire_created_from_application": "Hiring requisition created from application",
    "collaborator.invited": "Collaborator invited",
    "position.assigned": "Position assigned",
    "grade.auto_resolved": "Grade resolved",
    "onboarding.started": "Onboarding started",
    "staff_onboarding.completed": "Onboarding completed",
    "vendor_profile.status_changed": "Vendor Approval status changed",
    "access_status.changed": "Access status changed",
  };

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">HR / People</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Ordift&rsquo;s operational HR command centre — genuine counts from existing records, an outstanding-actions
          queue, and quick access to every underlying module. Nothing below duplicates or rebuilds those modules.
        </p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {KPI_CARDS.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="rounded-xl border border-black/10 bg-white p-4 hover:border-ordift-gold/60 transition-colors"
          >
            <p className="font-sans text-[1.75rem] leading-none font-semibold text-ordift-ink tabular-nums">{summary[card.key]}</p>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1.5">{card.label}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Needs Your Attention</h2>
        {needsAttention.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">Nothing outstanding right now.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {needsAttention.map((item) => (
              <li key={item.key} className="py-2.5">
                <Link href={item.href} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                  {item.label} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Hiring / Onboarding Pipeline</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {pipeline.map((stage, i) => (
            <div key={stage.key} className="text-center">
              <p className="font-sans text-[1.5rem] leading-none font-semibold text-ordift-ink tabular-nums">{stage.count}</p>
              <p className="font-sans text-caption text-ordift-ink-muted mt-1">{stage.label}</p>
              {i < pipeline.length - 1 && <p className="text-ordift-ink-muted/40 mt-1 hidden sm:block" aria-hidden="true">→</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Recent Hires</h2>
            <Link href="/admin/organization/people" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
              Full directory →
            </Link>
          </div>
          {recentHires.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No staff accounts on record.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {recentHires.map((h) => (
                <li key={h.id} className="py-2">
                  <Link href={`/admin/organization/people/${h.id}`} className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed">
                    {h.fullName ?? "(no name on record)"}
                  </Link>
                  <p className="font-sans text-caption text-ordift-ink-muted">
                    {h.positionName ?? "—"} {h.memberNumber ? `· ${h.memberNumber}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">External Workforce</h2>
          <ul className="divide-y divide-black/5">
            {Object.entries(externalWorkforceByType).map(([slug, count]) => (
              <li key={slug} className="py-2 flex items-center justify-between">
                <span className="font-sans text-body-small text-ordift-ink">{EXTERNAL_TYPE_LABELS[slug] ?? slug}</span>
                <span className="font-sans text-body-small font-semibold text-ordift-ink tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/organization/vendors" className="inline-block mt-3 font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
            Manage Vendors →
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Recent HR Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No recent HR activity recorded.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {recentActivity.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                <span className="font-sans text-body-small text-ordift-ink">
                  {ACTIVITY_LABELS[a.action] ?? a.action} — <span className="text-ordift-ink-muted">{a.actorLabel}</span>
                </span>
                <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Quick Access / HR Modules</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {HUB_GROUPS.map((group) => (
          <section key={group.label} className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{group.label}</h2>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-sans text-body-small font-semibold text-ordift-gold-pressed underline underline-offset-4">
                    {link.label} →
                  </Link>
                  <p className="font-sans text-caption text-ordift-ink-muted">{link.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
