import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listOpportunitiesForAdmin } from "@/lib/partnerships/opportunities";
import { listReferralsForAdmin } from "@/lib/partnerships/referrals";
import PartnershipsSubNav from "./PartnershipsSubNav";

export const metadata: Metadata = {
  title: "Partnerships & Collaborations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Partnerships & Collaborations V1 (2026-09-07) — Overview. Every
// figure here is a real count derived from listOpportunitiesForAdmin()/
// listReferralsForAdmin() — nothing is fabricated. A fresh system
// legitimately shows zeros; that is the correct, professional empty
// state, not a bug. Dollar-value aggregates (total NCV contributed,
// total cash consideration, total RCV, realised value) are
// deliberately NOT computed here in V1 — the schema (partnership_
// value_assessments, partnership_outcome_reviews) fully supports them
// later without any redesign, but building the cross-table SUM/JOIN
// reporting queries now would be overbuilding a BI dashboard for a
// system with no real data in it yet, per the approved spec's explicit
// "do not overbuild BI dashboards in V1" instruction.
export default async function PartnershipsOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const [opportunities, referrals] = await Promise.all([listOpportunitiesForAdmin(user.id), listReferralsForAdmin(user.id)]);

  const openStages = new Set(["opportunity", "qualification", "value_assessment", "proposed_terms"]);
  const awaitingAssessmentStages = new Set(["qualification", "value_assessment"]);
  const awaitingApprovalStages = new Set(["internal_review", "decision"]);
  const activeStages = new Set(["agreement", "signatures", "active", "deliverables"]);
  const completedStages = new Set(["completion", "outcome_review"]);

  const openCount = opportunities.filter((o) => openStages.has(o.status)).length;
  const awaitingAssessmentCount = opportunities.filter((o) => awaitingAssessmentStages.has(o.status)).length;
  const awaitingApprovalCount = opportunities.filter((o) => awaitingApprovalStages.has(o.status)).length;
  const activeCount = opportunities.filter((o) => activeStages.has(o.status)).length;
  const completedCount = opportunities.filter((o) => completedStages.has(o.status)).length;
  const referralsAwaitingApproval = referrals.filter((r) => r.approvalStatus === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Partnerships &amp; Collaborations</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Commercial qualification, value-assessment, and governance layer for collaborations — never a hidden
          cheaper price list. Ordift&rsquo;s existing pricing engines remain the source of truth for Normal
          Commercial Value.
        </p>
      </div>

      <PartnershipsSubNav active="overview" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Link href="/admin/partnerships/opportunities" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Open Opportunities</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{openCount}</p>
        </Link>
        <Link href="/admin/partnerships/opportunities?status=qualification" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Awaiting Assessment</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{awaitingAssessmentCount}</p>
        </Link>
        <Link href="/admin/partnerships/opportunities?status=decision" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Awaiting Approval</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{awaitingApprovalCount}</p>
        </Link>
        <Link href="/admin/partnerships/opportunities?status=active" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Active Partnerships</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{activeCount}</p>
        </Link>
        <Link href="/admin/partnerships/opportunities?status=completion" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Completed</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{completedCount}</p>
        </Link>
        <Link href="/admin/partnerships/referrals" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Referral Terms Awaiting Approval</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{referralsAwaitingApproval}</p>
        </Link>
      </div>

      {opportunities.length === 0 && (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-8 text-center">
          <p className="font-sans text-body-small text-ordift-ink-muted">No partnership opportunities yet.</p>
          <Link href="/admin/partnerships/opportunities" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 mt-2 inline-block">Create the first one →</Link>
        </div>
      )}
    </div>
  );
}
