import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listEngagementsForPayee, getValidEngagementTransitions } from "@/lib/payables/engagements";
import { listPaymentObligationsForPayee } from "@/lib/payments/payoutObligations";
import { listPaymentInstructionsForProfile } from "@/lib/payments/payeeInstructions";
import { listEngagementTypes, listOperationalTitles } from "@/lib/portal/adminData";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import {
  createPaymentInstructionAction,
  verifyPaymentInstructionAction,
  setPaymentInstructionActiveAction,
  createEngagementAction,
  setEngagementStatusAction,
  createEngagementPayableAction,
  createStandalonePayableAction,
  setPayeeProfileStatusAction,
} from "../../actions";

export const metadata: Metadata = {
  title: "Payee — Payables — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPayeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) redirect("/admin/payables");

  const { id } = await params;
  const [payee, engagements, payables, instructions, engagementTypes, operationalTitles, history] = await Promise.all([
    getPayeeProfile(id),
    listEngagementsForPayee(id),
    listPaymentObligationsForPayee(id),
    listPaymentInstructionsForProfile(id),
    listEngagementTypes(),
    listOperationalTitles(),
    getActivityForEntity("user", id),
  ]);
  if (!payee) notFound();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance · Payables · Payee</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{payee.fullName ?? "(no name)"}</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
            {payee.category} {payee.operationalTitleName ? `· ${payee.operationalTitleName}` : ""} {payee.companyName ? `· ${payee.companyName}` : ""} · status: {payee.status}
          </p>
        </div>
        <form action={setPayeeProfileStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="payeeProfileId" value={payee.id} />
          <select name="status" defaultValue={payee.status} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-caption">
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="suspended">suspended</option>
          </select>
          <button type="submit" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-caption hover:border-black/30">
            Update Status
          </button>
        </form>
      </div>

      {/* Payment destinations */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Payment Destination</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-4">
          Full account numbers are never shown here — only the last 4 characters. Editing any detail resets
          verification to &ldquo;unverified&rdquo; until re-confirmed.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-6">
          {instructions.map((i) => (
            <li key={i.id} className="px-4 py-3">
              <p className="font-sans text-body-small text-ordift-ink">
                {i.method} · {i.institutionName ?? "—"} · {i.accountHolderName} · {i.maskedAccountIdentifier ?? "—"}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted mb-2">
                {i.country} · {i.currency} · {i.verificationStatus} · {i.active ? "active" : "deactivated"} {i.isDefault ? "· default" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={verifyPaymentInstructionAction}>
                  <input type="hidden" name="instructionId" value={i.id} />
                  <input type="hidden" name="profileId" value={payee.id} />
                  <input type="hidden" name="verified" value="true" />
                  <button type="submit" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    Verify
                  </button>
                </form>
                <form action={verifyPaymentInstructionAction}>
                  <input type="hidden" name="instructionId" value={i.id} />
                  <input type="hidden" name="profileId" value={payee.id} />
                  <input type="hidden" name="verified" value="false" />
                  <button type="submit" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    Reject
                  </button>
                </form>
                <form action={setPaymentInstructionActiveAction}>
                  <input type="hidden" name="instructionId" value={i.id} />
                  <input type="hidden" name="profileId" value={payee.id} />
                  <input type="hidden" name="active" value={i.active ? "false" : "true"} />
                  <button type="submit" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    {i.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            </li>
          ))}
          {instructions.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>

        <details className="rounded-lg border border-black/10 p-4">
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Add a payment destination</summary>
          <form action={createPaymentInstructionAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <input type="hidden" name="profileId" value={payee.id} />
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Method</span>
              <select name="method" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="bank_account">Bank account</option>
                <option value="mobile_money">Mobile money</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Country (ISO 3166-1 alpha-2)</span>
              <input name="country" required maxLength={2} placeholder="GH" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Currency</span>
              <input name="currency" required placeholder="GHS" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Account holder name</span>
              <input name="accountHolderName" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Institution name (optional)</span>
              <input name="institutionName" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Account identifier</span>
              <input name="accountIdentifier" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Routing identifier (optional)</span>
              <input name="routingIdentifier" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input type="checkbox" name="makeDefault" />
              <span className="font-sans text-caption text-ordift-ink-muted">Make default</span>
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
                Save Destination
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Engagements */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Engagements</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-6">
          {engagements.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <p className="font-sans text-body-small text-ordift-ink">
                {e.operationalTitleName ?? e.roleNote ?? "Engagement"} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted mb-2">
                Status: <strong>{e.status}</strong> {e.agreedAmount ? `· ${e.currency} ${e.agreedAmount}` : ""} {e.paymentObligationId ? "· payable linked" : ""}
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {getValidEngagementTransitions(e.status).map((t) => (
                  <form key={t.to} action={setEngagementStatusAction}>
                    <input type="hidden" name="engagementId" value={e.id} />
                    <input type="hidden" name="payeeProfileId" value={payee.id} />
                    <input type="hidden" name="status" value={t.to} />
                    {t.requiresConfirmation ? (
                      <ConfirmSubmitButton
                        confirmMessage={`${t.label} for this engagement? This changes its status to "${t.to}" and is recorded in the audit trail.`}
                        className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30"
                      >
                        {t.label}
                      </ConfirmSubmitButton>
                    ) : (
                      <button type="submit" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                        {t.label}
                      </button>
                    )}
                  </form>
                ))}
              </div>
              {!e.paymentObligationId && e.agreedAmount && (
                <form action={createEngagementPayableAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="engagementId" value={e.id} />
                  <input type="hidden" name="payeeProfileId" value={payee.id} />
                  <input
                    name="description"
                    required
                    defaultValue={`${e.operationalTitleName ?? "Engagement"} compensation`}
                    className="rounded border border-black/15 px-2 py-1 font-sans text-caption"
                  />
                  <button type="submit" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    Create Payable
                  </button>
                </form>
              )}
              {e.paymentObligationId && (
                <Link href={`/admin/payables/${e.paymentObligationId}`} className="font-sans text-caption underline text-ordift-ink">
                  View payable →
                </Link>
              )}
            </li>
          ))}
          {engagements.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>

        <details className="rounded-lg border border-black/10 p-4">
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Create an engagement</summary>
          <form action={createEngagementAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <input type="hidden" name="payeeProfileId" value={payee.id} />
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Engagement type</span>
              <select name="engagementTypeId" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="">—</option>
                {engagementTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Service / role</span>
              <select name="operationalTitleId" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="">—</option>
                {operationalTitles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Role note (optional)</span>
              <input name="roleNote" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Agreed amount (optional)</span>
              <input name="agreedAmount" type="number" step="0.01" min="0" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Currency</span>
              <input name="currency" placeholder="GHS" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Due date (optional)</span>
              <input name="dueDate" type="date" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-sans text-caption text-ordift-ink-muted">Notes (optional)</span>
              <textarea name="notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
                Create Engagement
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Payables */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Payables</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-6">
          {payables.map((o) => (
            <li key={o.id} className="px-4 py-3">
              <Link href={`/admin/payables/${o.id}`} className="block hover:opacity-70">
                <p className="font-sans text-body-small text-ordift-ink">{o.description}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {o.currency} {o.amount} · {o.status}
                </p>
              </Link>
            </li>
          ))}
          {payables.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>

        <details className="rounded-lg border border-black/10 p-4">
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Create a standalone payable</summary>
          <form action={createStandalonePayableAction} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <input type="hidden" name="payeeProfileId" value={payee.id} />
            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className="font-sans text-caption text-ordift-ink-muted">Description</span>
              <input name="description" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Amount</span>
              <input name="amount" type="number" step="0.01" min="0.01" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Currency</span>
              <input name="currency" required placeholder="GHS" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <div className="flex items-end">
              <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
                Create Payable
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Audit trail */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Audit Trail</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {history.map((h) => (
            <li key={h.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{h.action}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {h.actorLabel} · {new Date(h.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
          {history.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
