import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listEngagementsForPayee, getValidEngagementTransitions } from "@/lib/payables/engagements";
import { listPaymentObligationsForPayee } from "@/lib/payments/payoutObligations";
import { listPaymentInstructionsForProfile } from "@/lib/payments/payeeInstructions";
import { listActiveCurrencies } from "@/lib/payments/currency";
import { listEngagementTypes, listOperationalTitles } from "@/lib/portal/adminData";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { PAYMENT_METHOD_LABELS, countryName, verificationStatusLabel, type PaymentMethod } from "@/lib/payables/paymentDestinationShared";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import SubmitButton from "@/components/admin/SubmitButton";
import PaymentDestinationForm from "@/components/payables/PaymentDestinationForm";
import EditEngagementForm from "@/components/payables/EditEngagementForm";
import StandalonePayableForm from "@/components/payables/StandalonePayableForm";
import CreateEngagementForm from "@/components/payables/CreateEngagementForm";
import {
  createPaymentInstructionAction,
  verifyPaymentInstructionAction,
  setPaymentInstructionActiveAction,
  createEngagementAction,
  setEngagementStatusAction,
  createEngagementPayableAction,
  createStandalonePayableAction,
  setPayeeProfileStatusAction,
  updateEngagementAction,
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
  const [payee, engagements, payables, instructions, currencies, engagementTypes, operationalTitles, history] = await Promise.all([
    getPayeeProfile(id),
    listEngagementsForPayee(id),
    listPaymentObligationsForPayee(id),
    listPaymentInstructionsForProfile(id),
    listActiveCurrencies(),
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
          <SubmitButton pendingLabel="Updating…" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-caption hover:border-black/30">
            Update Status
          </SubmitButton>
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
                {PAYMENT_METHOD_LABELS[i.method as PaymentMethod] ?? i.method} · {i.institutionName ?? "—"} · {i.accountHolderName} · {i.maskedAccountIdentifier ?? "—"}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted mb-2">
                {countryName(i.country)} · {i.currency} · {verificationStatusLabel(i.verificationStatus)} · {i.active ? "active" : "deactivated"} {i.isDefault ? "· default" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={verifyPaymentInstructionAction}>
                  <input type="hidden" name="instructionId" value={i.id} />
                  <input type="hidden" name="profileId" value={payee.id} />
                  <input type="hidden" name="verified" value="true" />
                  <SubmitButton pendingLabel="Verifying…" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    Verify
                  </SubmitButton>
                </form>
                <form action={verifyPaymentInstructionAction}>
                  <input type="hidden" name="instructionId" value={i.id} />
                  <input type="hidden" name="profileId" value={payee.id} />
                  <input type="hidden" name="verified" value="false" />
                  <SubmitButton pendingLabel="Rejecting…" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    Reject
                  </SubmitButton>
                </form>
                <form action={setPaymentInstructionActiveAction}>
                  <input type="hidden" name="instructionId" value={i.id} />
                  <input type="hidden" name="profileId" value={payee.id} />
                  <input type="hidden" name="active" value={i.active ? "false" : "true"} />
                  <SubmitButton
                    pendingLabel={i.active ? "Deactivating…" : "Reactivating…"}
                    className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30"
                  >
                    {i.active ? "Deactivate" : "Reactivate"}
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
          {instructions.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>

        <details className="rounded-lg border border-black/10 p-4">
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Add a payment destination</summary>
          <div className="mt-4">
            <PaymentDestinationForm
              targetProfileId={payee.id}
              currencies={currencies}
              createAction={createPaymentInstructionAction}
              onSuccessMessage="Payment destination saved."
            />
          </div>
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
                        pendingLabel="Working…"
                        className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30"
                      >
                        {t.label}
                      </ConfirmSubmitButton>
                    ) : (
                      <SubmitButton pendingLabel="Working…" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                        {t.label}
                      </SubmitButton>
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
                  <ConfirmSubmitButton
                    confirmMessage={`Create a payable for ${e.currency ?? ""} ${e.agreedAmount}? This is a real financial obligation and will be sent for approval.`}
                    pendingLabel="Creating…"
                    className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30"
                  >
                    Create Payable
                  </ConfirmSubmitButton>
                </form>
              )}
              {e.paymentObligationId && (
                <Link href={`/admin/payables/${e.paymentObligationId}`} className="font-sans text-caption underline text-ordift-ink">
                  View payable →
                </Link>
              )}{" "}
              <Link href={`/admin/payables/engagements/${e.id}/media`} className="font-sans text-caption underline text-ordift-ink">
                Manage files →
              </Link>
              {/* Payable Safety Hardening (2026-09-04), Part B — editing is only
                  ever offered before a payable is linked; updateEngagement()
                  itself refuses the edit server-side once paymentObligationId
                  is set, so this is the honest UI reflection of that lock. */}
              {!e.paymentObligationId && (
                <details className="mt-2">
                  <summary className="font-sans text-caption text-ordift-ink-muted cursor-pointer">Edit engagement</summary>
                  <div className="mt-3">
                    <EditEngagementForm
                      engagement={{
                        id: e.id,
                        engagementTypeId: e.engagementTypeId,
                        operationalTitleId: e.operationalTitleId,
                        roleNote: e.roleNote,
                        currency: e.currency,
                        agreedAmount: e.agreedAmount,
                        dueDate: e.dueDate,
                        notes: e.notes,
                        payeeProfileId: payee.id,
                      }}
                      currencies={currencies}
                      engagementTypes={engagementTypes}
                      operationalTitles={operationalTitles}
                      updateAction={updateEngagementAction}
                    />
                  </div>
                </details>
              )}
            </li>
          ))}
          {engagements.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>

        <details className="rounded-lg border border-black/10 p-4">
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Create an engagement</summary>
          <CreateEngagementForm
            payeeProfileId={payee.id}
            currencies={currencies}
            engagementTypes={engagementTypes}
            operationalTitles={operationalTitles}
            createAction={createEngagementAction}
          />
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
          <StandalonePayableForm payeeProfileId={payee.id} currencies={currencies} createAction={createStandalonePayableAction} />
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
