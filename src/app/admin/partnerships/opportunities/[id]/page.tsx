import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { getOpportunityById, listPartnershipTypes } from "@/lib/partnerships/opportunities";
import { listValueAssessmentHistory } from "@/lib/partnerships/valueAssessments";
import { getLatestStrategicAssessment } from "@/lib/partnerships/strategicAssessments";
import { listAgreementHistory } from "@/lib/partnerships/agreements";
import { getLatestReferralTerms } from "@/lib/partnerships/referrals";
import { listOutcomeReviews } from "@/lib/partnerships/outcomeReviews";
import { listPayeeProfiles } from "@/lib/payables/payeeProfiles";
import { getRecommendationsFor, recommendationHref } from "@/lib/services/crossServiceRecommendations";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { statusLabel, STATUS_OPTIONS } from "../page";
import {
  setOpportunityStatusAction,
  createStrategicAssessmentAction,
  createAgreementVersionAction,
  createReferralTermsAction,
  createOutcomeReviewAction,
  convertToPaidProposalAction,
  setOpportunityPayeeProfileAction,
} from "../../actions";
import ValueAssessmentForm from "./ValueAssessmentForm";
import ConcessionApprovalControls from "./ConcessionApprovalControls";

export const metadata: Metadata = {
  title: "Opportunity — Partnerships — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const CONCESSION_BAND_LABELS: Record<string, string> = {
  commercial_partnership: "Commercial Partnership (0-15%)",
  preferred_collaboration: "Preferred Collaboration (>15-30%)",
  strategic_collaboration: "Strategic Collaboration (>30-50%)",
  major_strategic_contribution: "Major Strategic Contribution (>50-75%) — Founder/Super Admin only",
  exceptional_sponsored_work: "Exceptional / Sponsored Work (>75%) — Founder/Super Admin only",
  fully_sponsored_pro_bono: "Fully Sponsored / Pro Bono (100%) — Founder/Super Admin only",
};

export default async function PartnershipOpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const opportunity = await getOpportunityById(user.id, id);
  if (!opportunity) notFound();

  const [types, assessmentHistory, strategicAssessment, agreementHistory, referralTerms, outcomeReviews, payees] = await Promise.all([
    listPartnershipTypes(),
    listValueAssessmentHistory(user.id, id),
    getLatestStrategicAssessment(user.id, id),
    listAgreementHistory(user.id, id),
    getLatestReferralTerms(user.id, id),
    listOutcomeReviews(user.id, id),
    listPayeeProfiles(user.id),
  ]);
  const partnershipType = types.find((t) => t.id === opportunity.partnershipTypeId);
  const latestAssessment = assessmentHistory[0] ?? null;
  const latestAgreement = agreementHistory[0] ?? null;
  const linkedPayee = opportunity.payeeProfileId ? payees.find((p) => p.id === opportunity.payeeProfileId) : undefined;
  const recommendations = getRecommendationsFor("partnerships");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/partnerships/opportunities" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Opportunities</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{opportunity.counterpartName}{opportunity.counterpartOrganisation ? ` — ${opportunity.counterpartOrganisation}` : ""}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{partnershipType?.label ?? "Unknown type"} · <strong>{statusLabel(opportunity.status)}</strong>{opportunity.decisionOutcome ? ` · Decision: ${opportunity.decisionOutcome}` : ""}</p>
        {opportunity.summary && <p className="font-sans text-body-small text-ordift-ink mt-2">{opportunity.summary}</p>}
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Payment Setup</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Required only if this partner will be paid (e.g. a referral commission). Linking here never creates a
          payee, verifies payment details, or creates a payable — it only records which existing payee profile the
          Referral Payable Bridge should use before submitting a commission to Payables.
        </p>
        {linkedPayee ? (
          <p className="font-sans text-body-small text-green-800">Linked to {linkedPayee.fullName ?? linkedPayee.companyName ?? linkedPayee.id}.</p>
        ) : (
          <p className="font-sans text-body-small text-amber-800">Not linked — a referral commission for this partner cannot be approved for payment until this is set.</p>
        )}
        <form action={setOpportunityPayeeProfileAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          {payees.length > 0 ? (
            <select name="payeeProfileId" defaultValue={opportunity.payeeProfileId ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="">Not linked</option>
              {payees.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName ?? p.companyName ?? p.id} · {p.category}</option>
              ))}
            </select>
          ) : (
            <input name="payeeProfileId" defaultValue={opportunity.payeeProfileId ?? ""} placeholder="Existing payee profile ID (create one under Payables → Payees first)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small w-full sm:w-auto" />
          )}
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save</button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Lifecycle Stage</h2>
        <form action={setOpportunityStatusAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <select name="status" defaultValue={opportunity.status} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            {STATUS_OPTIONS.map((s) => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
          <select name="decisionOutcome" defaultValue={opportunity.decisionOutcome ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="">No decision recorded</option>
            <option value="commercially_acceptable">Commercially Acceptable</option>
            <option value="strategic_exception">Strategic Exception</option>
            <option value="convert_to_paid_proposal">Convert to Paid Proposal</option>
            <option value="declined">Declined</option>
          </select>
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Update</button>
        </form>
        <p className="font-sans text-caption text-ordift-ink-muted">Moving the stage forward records an internal decision only — it never fabricates external client/partner acceptance. That happens in the Agreement section below.</p>
        <form action={convertToPaidProposalAction}>
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <ConfirmSubmitButton confirmMessage="Convert this to a Paid Proposal? This preserves the full opportunity history and only records the internal decision — it does not create a booking or charge the client automatically." pendingLabel="Converting…" className="rounded-lg border border-ordift-ink px-3 py-1.5 font-sans text-caption text-ordift-ink">
            Convert to Paid Proposal
          </ConfirmSubmitButton>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Value Assessment (NCV / PCV / RCV / Cash)</h2>
        {latestAssessment ? (
          <div className="rounded-lg bg-ordift-offwhite p-4 space-y-1 font-sans text-body-small text-ordift-ink">
            <p>NCV: {latestAssessment.ncvCurrency} {latestAssessment.ncvAmount.toFixed(2)}{latestAssessment.ncvBasis ? ` (${latestAssessment.ncvBasis})` : ""}</p>
            {latestAssessment.pcvAmount != null && <p>PCV (partner claimed): {latestAssessment.pcvCurrency} {latestAssessment.pcvAmount.toFixed(2)} — {latestAssessment.pcvDescription}</p>}
            <p>RCV (Ordift recognised): {latestAssessment.rcvCurrency} {latestAssessment.rcvAmount.toFixed(2)} — {latestAssessment.rcvValueClass}</p>
            <p>Cash consideration: {latestAssessment.cashConsiderationCurrency} {latestAssessment.cashConsiderationAmount.toFixed(2)}</p>
            <p className="font-medium">Net Ordift Contribution: ${latestAssessment.netOrdiftContributionUsd.toFixed(2)}</p>
            {latestAssessment.effectiveConcessionPercentage != null ? (
              <p className="font-medium">Effective Concession: {latestAssessment.effectiveConcessionPercentage}% — {CONCESSION_BAND_LABELS[latestAssessment.concessionBand ?? ""] ?? latestAssessment.concessionBand}</p>
            ) : latestAssessment.partnerPositiveValueUsd != null ? (
              <p className="font-medium text-green-800">Partner-positive value: ${latestAssessment.partnerPositiveValueUsd.toFixed(2)} above Ordift&rsquo;s contribution — not a discount, and no negative percentage is shown.</p>
            ) : null}
            <p>Approval: <strong>{latestAssessment.approvalStatus}</strong></p>
            {latestAssessment.approvalStatus === "pending" && <ConcessionApprovalControls assessmentId={latestAssessment.id} opportunityId={opportunity.id} />}
          </div>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No value assessment recorded yet.</p>
        )}
        <details className="rounded-lg border border-black/10 px-4 py-3">
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Record a new value assessment</summary>
          <div className="mt-3">
            <ValueAssessmentForm opportunityId={opportunity.id} />
          </div>
        </details>
        {assessmentHistory.length > 1 && (
          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Assessment history ({assessmentHistory.length})</summary>
            <ul className="mt-2 divide-y divide-black/5 font-sans text-caption text-ordift-ink-muted">
              {assessmentHistory.map((a) => (
                <li key={a.id} className="py-1.5">NCV ${a.ncvAmount.toFixed(2)} / RCV ${a.rcvAmount.toFixed(2)} / Cash ${a.cashConsiderationAmount.toFixed(2)} — {a.approvalStatus} — {new Date(a.createdAt).toLocaleString()}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Strategic Score</h2>
        {strategicAssessment ? (
          <div className="rounded-lg bg-ordift-offwhite p-4 font-sans text-body-small text-ordift-ink">
            <p className="font-medium">Final score: {strategicAssessment.finalScore}/100 — {strategicAssessment.interpretation}</p>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Base {strategicAssessment.baseScore} − risk deductions {strategicAssessment.riskDeductionTotal}. Informational only — never auto-approves anything; human authorization remains mandatory regardless of score.</p>
          </div>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No strategic assessment recorded yet.</p>
        )}
        <details className="rounded-lg border border-black/10 px-4 py-3">
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Record a strategic score</summary>
          <form action={createStrategicAssessmentAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            {[
              ["targetClientAlignment", "Target-client alignment (0-20)"],
              ["brandReputationAlignment", "Brand/reputation alignment (0-15)"],
              ["portfolioCreativeValue", "Portfolio/creative value (0-15)"],
              ["measurableDistribution", "Measurable distribution (0-15)"],
              ["revenueLeadPotential", "Revenue/lead potential (0-15)"],
              ["marketEntryRelationshipValue", "Market-entry/relationship value (0-10)"],
              ["longTermStrategicValue", "Long-term strategic value (0-10)"],
            ].map(([name, label]) => (
              <input key={name} name={name} type="number" min="0" placeholder={label} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            ))}
            {[
              ["broadExclusivity", "Risk: broad exclusivity (0-20)"],
              ["unclearUsageIp", "Risk: unclear usage/IP (0-20)"],
              ["highUnreimbursedDirectCost", "Risk: high unreimbursed direct cost (0-20)"],
              ["reputationBrandRisk", "Risk: reputation/brand risk (0-25)"],
              ["unrealisticDeliverablesTimeline", "Risk: unrealistic deliverables/timeline (0-15)"],
              ["poorCounterpartyHistory", "Risk: poor counterparty history (0-20)"],
            ].map(([name, label]) => (
              <input key={name} name={name} type="number" min="0" placeholder={label} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            ))}
            <textarea name="notes" placeholder="Notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Save Score</button>
          </form>
        </details>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Agreement</h2>
        {latestAgreement ? (
          <div className="rounded-lg bg-ordift-offwhite p-4 font-sans text-body-small text-ordift-ink">
            <p>Status: <strong>{latestAgreement.status}</strong></p>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Acceptance recorded: {latestAgreement.acceptanceRecordedAt ? new Date(latestAgreement.acceptanceRecordedAt).toLocaleString() : "Not yet — never fabricated automatically"}</p>
            {latestAgreement.signatureReference && <p className="font-sans text-caption text-ordift-ink-muted">Signature reference: {latestAgreement.signatureReference}</p>}
          </div>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No agreement drafted yet.</p>
        )}
        <details className="rounded-lg border border-black/10 px-4 py-3">
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Create / amend agreement</summary>
          <form action={createAgreementVersionAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <select name="status" defaultValue="draft" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
              <option value="active">Active</option>
              <option value="amended">Amended</option>
              <option value="terminated">Terminated</option>
            </select>
            <input name="approvalAuthority" placeholder="Approval authority (who approved this)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <textarea name="parties" placeholder="Parties" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="scope" placeholder="Scope" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="deliverables" placeholder="Deliverables" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="directCostResponsibility" placeholder="Direct-cost responsibility" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="ipNotes" placeholder="IP notes (ownership vs licensed usage)" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="timeline" placeholder="Timeline" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <textarea name="cancellationTerms" placeholder="Cancellation terms" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <textarea name="credits" placeholder="Credits" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <textarea name="confidentiality" placeholder="Confidentiality" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="signatureReference" placeholder="Signature/acceptance reference (external, if any)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink sm:col-span-2">
              <input type="checkbox" name="acceptanceRecorded" value="true" className="w-4 h-4" /> Record acceptance now (only check this if genuine client/partner acceptance has actually occurred)
            </label>
            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Save Agreement Version</button>
          </form>
        </details>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Referral Terms</h2>
        {referralTerms ? (
          <div className="rounded-lg bg-ordift-offwhite p-4 font-sans text-body-small text-ordift-ink">
            <p>{referralTerms.commissionPercentage}% commission · {referralTerms.durationPreset} · attribution window {referralTerms.attributionWindowDays} days</p>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Approval: {referralTerms.approvalStatus}{referralTerms.requiresFounderApproval ? " (requires Founder/Super Admin)" : ""}</p>
          </div>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No referral terms set — only relevant for Referral Partnership collaborations.</p>
        )}
        <details className="rounded-lg border border-black/10 px-4 py-3">
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Set referral terms</summary>
          <form action={createReferralTermsAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <select name="commissionPercentage" defaultValue="10" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              {[5, 7.5, 10, 12.5, 15, 20].map((p) => (
                <option key={p} value={p}>{p}%</option>
              ))}
            </select>
            <select name="durationPreset" defaultValue="first_engagement" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="first_engagement">First engagement only</option>
              <option value="six_months">Eligible revenue for 6 months</option>
              <option value="twelve_months">Eligible revenue for 12 months</option>
            </select>
            <input name="reasonForElevatedRate" placeholder="Reason (required at 15%+)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Save Referral Terms</button>
          </form>
        </details>
        <p className="font-sans text-caption text-ordift-ink-muted">Manage the individual referred leads and earned-commission events on the <Link href="/admin/partnerships/referrals" className="underline underline-offset-4">Referrals</Link> page.</p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Outcome Review{outcomeReviews.length > 0 ? ` (${outcomeReviews.length})` : ""}</h2>
        {outcomeReviews.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No outcome review recorded yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {outcomeReviews.map((r) => (
              <li key={r.id} className="py-2.5 font-sans text-body-small text-ordift-ink">
                <p>Would collaborate again: <strong>{r.wouldCollaborateAgain ?? "not recorded"}</strong></p>
                {r.relationshipOutcome && <p className="font-sans text-caption text-ordift-ink-muted mt-1">{r.relationshipOutcome}</p>}
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-lg border border-black/10 px-4 py-3">
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Record outcome review</summary>
          <form action={createOutcomeReviewAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <input name="cashActuallyReceivedAmount" type="number" step="0.01" placeholder="Cash actually received" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="actualOrdiftDirectCost" type="number" step="0.01" placeholder="Actual Ordift direct cost" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="leadsGeneratedCount" type="number" placeholder="Leads generated" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="attributableBookingsCount" type="number" placeholder="Attributable bookings" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="attributableRevenueAmount" type="number" step="0.01" placeholder="Attributable revenue" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <select name="wouldCollaborateAgain" defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="">Would collaborate again?</option>
              <option value="yes">Yes</option>
              <option value="conditional">Conditional</option>
              <option value="no">No</option>
            </select>
            <textarea name="reachDistributionResult" placeholder="Reach/distribution result" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="portfolioValueOutcome" placeholder="Portfolio value outcome" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="relationshipOutcome" placeholder="Relationship outcome" rows={1} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="notes" placeholder="Notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Save Outcome Review</button>
          </form>
        </details>
      </section>

      {recommendations.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Related Services</h2>
          {recommendations.map((r) => (
            <Link key={r.label} href={recommendationHref(r)} className="block font-sans text-body-small text-ordift-ink underline underline-offset-4">{r.label}</Link>
          ))}
        </section>
      )}
    </div>
  );
}
