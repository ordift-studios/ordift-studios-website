import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listReferralsForAdmin, listLeadsForReferral } from "@/lib/partnerships/referrals";
import { listCommissionEventsForLead } from "@/lib/partnerships/referralCommissions";
import { getOpportunityById } from "@/lib/partnerships/opportunities";
import { getPaymentObligation, PAYABLE_STATUS_LABELS } from "@/lib/payments/payoutObligations";
import PartnershipsSubNav from "../PartnershipsSubNav";
import ApproveForPaymentButton from "./ApproveForPaymentButton";
import {
  approveReferralTermsAction,
  createReferralLeadAction,
  disputeReferralLeadAction,
  recordCommissionEventAction,
  setCommissionEventStatusAction,
} from "../actions";

export const metadata: Metadata = {
  title: "Referrals — Partnerships — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function PartnershipReferralsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.partnershipReferralAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const referrals = await listReferralsForAdmin(user.id);
  const referralDetails = await Promise.all(
    referrals.map(async (r) => {
      const [opportunity, leads] = await Promise.all([getOpportunityById(user.id, r.opportunityId), listLeadsForReferral(user.id, r.id)]);
      const leadsWithEvents = await Promise.all(
        leads.map(async (lead) => {
          const events = await listCommissionEventsForLead(user.id, lead.id);
          // For any event already submitted to Payables, read the LIVE
          // status from the linked payment_obligations row — Finance's
          // own source of truth, never a second status stored here.
          const eventsWithObligation = await Promise.all(
            events.map(async (event) => ({ event, obligation: event.paymentObligationId ? await getPaymentObligation(event.paymentObligationId) : null }))
          );
          return { lead, eventsWithObligation };
        })
      );
      return { referral: r, opportunity, leadsWithEvents };
    })
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Partnerships</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Referrals</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Commission is earned only on qualifying revenue Ordift actually collects — never quote value, an issued
          invoice, or a signed contract. Registering a referral never creates a payable; an actual payout remains a
          separate, explicit step.
        </p>
      </div>

      <PartnershipsSubNav active="referrals" />

      {referralDetails.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-8 text-center">
          <p className="font-sans text-body-small text-ordift-ink-muted">No referral relationships yet.</p>
          <Link href="/admin/partnerships/opportunities" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 mt-2 inline-block">Set referral terms from an Opportunity →</Link>
        </div>
      ) : (
        referralDetails.map(({ referral, opportunity, leadsWithEvents }) => (
          <section key={referral.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif font-medium text-body text-ordift-ink">
                  {opportunity ? <Link href={`/admin/partnerships/opportunities/${opportunity.id}`} className="underline underline-offset-4">{opportunity.counterpartName}</Link> : "Unknown opportunity"}
                </h2>
                <p className="font-sans text-caption text-ordift-ink-muted">{referral.commissionPercentage}% commission · {referral.durationPreset} · {referral.attributionWindowDays}-day attribution window · approval: {referral.approvalStatus}{referral.requiresFounderApproval ? " (Founder/Super Admin required)" : ""}</p>
                <p className="font-sans text-caption mt-1">
                  Payee/payment setup: {opportunity?.payeeProfileId ? <span className="text-green-800">linked</span> : <span className="text-amber-800">not linked — set on the <Link href={`/admin/partnerships/opportunities/${opportunity?.id ?? ""}`} className="underline underline-offset-4">Opportunity</Link> before any commission can be approved for payment</span>}
                </p>
              </div>
              {referral.approvalStatus === "pending" && (
                <form action={approveReferralTermsAction}>
                  <input type="hidden" name="referralId" value={referral.id} />
                  <button type="submit" className="rounded-lg border border-green-600 text-green-700 px-3 py-1.5 font-sans text-caption shrink-0">Approve Terms</button>
                </form>
              )}
            </div>

            <details className="rounded-lg border border-black/10 px-4 py-3">
              <summary className="cursor-pointer font-sans text-caption font-medium text-ordift-ink select-none">Record a referred lead</summary>
              <form action={createReferralLeadAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <input type="hidden" name="referralId" value={referral.id} />
                <input type="hidden" name="attributionWindowDays" value={referral.attributionWindowDays} />
                <input name="prospectName" required placeholder="Prospect name" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                <input name="prospectEmail" type="email" placeholder="Prospect email (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    ["isAlreadyClient", "Already a client"],
                    ["hasActiveEnquiry", "Has active enquiry"],
                    ["alreadyInPipeline", "Already in pipeline"],
                    ["alreadyAttributedToOther", "Already attributed elsewhere"],
                    ["isSelfReferral", "Self-referral"],
                    ["isDuplicateReferral", "Duplicate referral"],
                    ["isCircularReferral", "Circular referral"],
                    ["isEmployeeAssignedClient", "Employee's assigned client"],
                    ["isRelatedParty", "Related party"],
                    ["relatedPartyDisclosed", "Related party disclosed"],
                  ].map(([name, label]) => (
                    <label key={name} className="flex items-center gap-1.5 font-sans text-caption text-ordift-ink">
                      <input type="checkbox" name={name} value="true" className="w-3.5 h-3.5" /> {label}
                    </label>
                  ))}
                </div>
                <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Record Lead</button>
              </form>
            </details>

            {leadsWithEvents.length > 0 && (
              <div className="space-y-3">
                {leadsWithEvents.map(({ lead, eventsWithObligation }) => (
                  <div key={lead.id} className="rounded-lg border border-black/10 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-sans text-body-small text-ordift-ink font-medium">{lead.prospectName}</p>
                      <span className="font-sans text-caption text-ordift-ink-muted">{lead.eligibilityStatus} · {lead.status}</span>
                    </div>
                    {lead.ineligibilityReasons.length > 0 && <p className="font-sans text-caption text-red-700">Ineligible: {lead.ineligibilityReasons.join(", ")}</p>}
                    {lead.attributionExpiresAt && <p className="font-sans text-caption text-ordift-ink-muted">Attribution expires {new Date(lead.attributionExpiresAt).toLocaleDateString()}</p>}
                    {lead.disputeNotes && <p className="font-sans text-caption text-red-700">Dispute: {lead.disputeNotes}</p>}

                    {eventsWithObligation.length > 0 && (
                      <ul className="space-y-2">
                        {eventsWithObligation.map(({ event: e, obligation }) => {
                          // Contextual action per spec Part L. "Paid" is
                          // derived live from the linked payment_obligations
                          // row's own status — never a second truth here.
                          const isPaid = obligation?.status === "paid";
                          return (
                            <li key={e.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2 font-sans text-caption text-ordift-ink border-t border-black/5 pt-2 first:border-t-0 first:pt-0">
                              <span>Rate {e.commissionPercentage}% · Eligible ${e.eligibleCollectedRevenue.toFixed(2)} · Earned ${e.commissionEarnedAmount.toFixed(2)} — {e.status}</span>
                              {e.status === "calculated" && (
                                <form action={setCommissionEventStatusAction} className="inline">
                                  <input type="hidden" name="eventId" value={e.id} />
                                  <input type="hidden" name="status" value="earned" />
                                  <button type="submit" className="text-ordift-gold-pressed underline underline-offset-4">Mark Earned</button>
                                </form>
                              )}
                              {e.status === "earned" && !e.paymentObligationId && (
                                opportunity?.payeeProfileId ? (
                                  <ApproveForPaymentButton eventId={e.id} counterpartName={opportunity?.counterpartName ?? "this partner"} amount={e.commissionEarnedAmount} currency={e.currency} />
                                ) : (
                                  <span className="text-amber-800">Payment Setup Required</span>
                                )
                              )}
                              {e.paymentObligationId && !isPaid && (
                                <Link href={`/admin/payables/${e.paymentObligationId}`} className="text-ordift-gold-pressed underline underline-offset-4">
                                  View Payable {obligation ? `(${PAYABLE_STATUS_LABELS[obligation.status] ?? obligation.status})` : ""}
                                </Link>
                              )}
                              {isPaid && (
                                <Link href={`/admin/payables/${e.paymentObligationId}`} className="text-green-800 underline underline-offset-4">Paid — View Payment Record</Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <details>
                      <summary className="cursor-pointer font-sans text-caption text-ordift-ink-muted select-none">Record collected revenue / dispute this lead</summary>
                      <form action={recordCommissionEventAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        <input type="hidden" name="referralLeadId" value={lead.id} />
                        <input name="grossCollectedAmount" type="number" step="0.01" min="0" required placeholder="Gross collected" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" />
                        <input name="excludedAmount" type="number" step="0.01" min="0" placeholder="Excluded (tax/refunds/pass-through)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" />
                        <input type="hidden" name="commissionPercentage" value={referral.commissionPercentage} />
                        <button type="submit" className="rounded-lg bg-ordift-ink text-white px-3 py-1.5 font-sans text-caption sm:col-span-2">Calculate Commission</button>
                      </form>
                      <form action={disputeReferralLeadAction} className="grid grid-cols-1 gap-2 mt-2">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input name="disputeNotes" placeholder="Dispute notes" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" />
                        <button type="submit" className="rounded-lg border border-red-600 text-red-700 px-3 py-1.5 font-sans text-caption">Dispute This Lead</button>
                      </form>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
