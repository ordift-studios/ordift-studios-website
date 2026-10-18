import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { findOrganisationMatches, getApplication, type ApplicationStatus } from "@/lib/organisations/registry";
import { confirmationRequirements, type SignalState } from "@/lib/organisations/approvalSignals";
import { isFreeMailDomain } from "@/lib/organisations/names";
import { closeApplicationAction, confirmApprovalAction, discardApprovalEmailAction, submitApprovalEmailAction } from "../../actions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";

export const metadata: Metadata = {
  title: "Supplier application — Organisations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: "Submitted — waiting for the organisation's approval",
  pending_confirmation: "Approval email attached — needs your confirmation",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const SIGNAL_STYLE: Record<SignalState, string> = {
  ok: "border-green-600/30 bg-green-50 text-green-900",
  warn: "border-amber-600/30 bg-amber-50 text-amber-900",
  bad: "border-red-600/30 bg-red-50 text-red-900",
  unknown: "border-black/15 bg-black/[0.03] text-ordift-ink-muted",
};
const SIGNAL_WORD: Record<SignalState, string> = { ok: "Matches", warn: "Check", bad: "Problem", unknown: "Unknown" };

const FIELD = "rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";

export default async function SupplierApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const app = await getApplication(user.id, id);
  if (!app) notFound();

  const open = app.status === "submitted" || app.status === "pending_confirmation";
  const pending = app.status === "pending_confirmation";
  const level = app.approvalMatchLevel ?? "weak";
  const need = confirmationRequirements(level);
  const matches = pending ? await findOrganisationMatches(user.id, { name: app.organisationName, domain: app.approvalSenderDomain ?? app.contactDomain }) : [];
  const likely = matches.filter((m) => m.strength === "exact" || m.strength === "likely");
  const preselected = app.organisationId ?? (likely[0]?.organisation.id ?? "__new__");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/organisations/applications" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Supplier applications</Link>
        <h1 className="mt-2 font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{app.organisationName}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          {app.reference ? `Reference ${app.reference} · ` : ""}Submitted {app.submittedOn} · {app.contactDomain ? `Expected sender domain ${app.contactDomain}` : "No expected sender domain recorded"}
        </p>
        <p className="mt-1 font-sans text-body-small font-medium text-ordift-ink">{STATUS_LABEL[app.status]}</p>
        {app.submissionNotes ? <p className="mt-2 font-sans text-body-small text-ordift-ink-muted whitespace-pre-wrap">{app.submissionNotes}</p> : null}
      </div>

      {app.status === "approved" ? (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Approved</h2>
          <p className="font-sans text-body-small text-ordift-ink">
            Confirmed {app.confirmedAt?.slice(0, 10)}. {app.organisationLabel ? `Registered as a client: ${app.organisationLabel}.` : ""}{" "}
            <Link href="/admin/organisations" className="underline underline-offset-4">View in the directory</Link>
          </p>
          {app.confirmationNote ? <p className="font-sans text-caption text-ordift-ink-muted">Note: {app.confirmationNote}</p> : null}
          <p className="font-sans text-caption text-ordift-ink-muted">Approval records the relationship only. It has not created a booking, invoice, payment obligation or any financial entry.</p>
        </section>
      ) : null}

      {app.status === "submitted" ? (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Attach the organisation&apos;s approval email</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted max-w-2xl">
            Open the email in your mailbox and paste it here: ideally &ldquo;Show original&rdquo; (all the headers), so the sender can be checked. Only the sender&apos;s domain, subject, date, authentication results and a short excerpt are kept, not the whole email. Attaching it approves nothing.
          </p>
          <ActionForm action={submitApprovalEmailAction} className="space-y-3">
            <input type="hidden" name="applicationId" value={app.id} />
            <textarea name="rawText" required rows={10} placeholder="Paste the email here" className={`${FIELD} w-full font-mono`} />
            <input name="senderAddress" placeholder="Sender's address, only if the pasted text has no headers" className={`${FIELD} w-full`} />
            <SubmitButton pendingLabel="Attaching…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Attach email</SubmitButton>
          </ActionForm>
        </section>
      ) : null}

      {pending ? (
        <>
          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif font-medium text-body text-ordift-ink">How the email matches this application</h2>
              <span className={`rounded-full border px-3 py-1 font-sans text-caption ${level === "strong" ? SIGNAL_STYLE.ok : level === "review" ? SIGNAL_STYLE.warn : SIGNAL_STYLE.bad}`}>
                {level === "strong" ? "Strong match" : level === "review" ? "Needs review" : "Weak match"}
              </span>
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted">
              {app.approvalSubject ? `Subject: ${app.approvalSubject} · ` : ""}From {app.approvalSenderDomain ?? "unknown sender"}{app.approvalSentOn ? ` · ${app.approvalSentOn}` : ""}. These are checks to help you decide; read the email yourself.
            </p>
            <ul className="space-y-2">
              {(app.approvalSignals ?? []).map((s) => (
                <li key={s.key} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${SIGNAL_STYLE[s.state]}`}>
                  <span className="font-semibold">{s.label}: {SIGNAL_WORD[s.state]}.</span> {s.detail}
                </li>
              ))}
            </ul>
            {app.approvalExcerpt ? (
              <details className="rounded-lg border border-black/10 px-3 py-2">
                <summary className="cursor-pointer font-sans text-body-small text-ordift-ink">Kept excerpt of the email</summary>
                <p className="mt-2 font-sans text-body-small text-ordift-ink-muted whitespace-pre-wrap">{app.approvalExcerpt}</p>
              </details>
            ) : null}
            <ActionForm action={discardApprovalEmailAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <ConfirmSubmitButton confirmMessage="Set this email aside? The application goes back to waiting for approval." pendingLabel="Setting aside…" className="rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink">
                Set this email aside (wrong application or not genuine)
              </ConfirmSubmitButton>
            </ActionForm>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Confirm the approval</h2>
            <p className="font-sans text-body-small text-ordift-ink-muted max-w-2xl">
              Confirming registers the organisation as a <strong>client</strong> (it has approved Ordift as its supplier) or updates its existing record. It does not create a booking, invoice, payment obligation or any financial entry, and it does not affect vendors or contractors who supply services to Ordift.
            </p>
            <ActionForm action={confirmApprovalAction} className="space-y-4">
              <input type="hidden" name="applicationId" value={app.id} />
              <fieldset className="space-y-2">
                <legend className="font-sans text-body-small font-medium text-ordift-ink">Which organisation is this?</legend>
                {matches.map((m) => (
                  <label key={m.organisation.id} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                    <input type="radio" name="organisationChoice" value={m.organisation.id} defaultChecked={preselected === m.organisation.id} className="mt-1" />
                    <span>
                      {m.organisation.name}
                      <span className="block font-sans text-caption text-ordift-ink-muted">
                        {m.organisation.primaryDomain ?? "No domain"} · already registered · {m.strength === "exact" ? "same name" : m.strength === "likely" ? "very similar" : "possibly the same"}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                  <input type="radio" name="organisationChoice" value="__new__" defaultChecked={preselected === "__new__"} className="mt-1" />
                  <span>A new organisation</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                  <input name="newName" defaultValue={app.organisationName} maxLength={200} placeholder="Registered name" className={FIELD} />
                  <input name="newDomain" defaultValue={app.contactDomain ?? (app.approvalSenderDomain && !isFreeMailDomain(app.approvalSenderDomain) ? app.approvalSenderDomain : "")} placeholder="Email domain (optional)" className={FIELD} />
                </div>
                {likely.length > 0 ? (
                  <label className="flex items-start gap-2 pl-6 font-sans text-caption text-ordift-ink-muted">
                    <input type="checkbox" name="confirmedDistinct" className="mt-0.5" />
                    A new organisation is correct: it is a different organisation from the registered ones above.
                  </label>
                ) : null}
              </fieldset>

              {need.acknowledgement ? (
                <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                  <input type="checkbox" name="acknowledgedReview" className="mt-1" />
                  <span>I have read the email and the checks above, and I have verified this approval is genuine{level === "weak" ? " by another means (describe below)" : ""}.</span>
                </label>
              ) : null}
              <textarea name="note" rows={2} maxLength={2000} placeholder={need.noteRequired ? "How was this approval verified? (required)" : "Note (optional)"} className={`${FIELD} w-full`} />
              <ConfirmSubmitButton confirmMessage="Confirm this approval and register or update the organisation as a client?" pendingLabel="Confirming…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">
                Confirm approval
              </ConfirmSubmitButton>
            </ActionForm>
          </section>
        </>
      ) : null}

      {open ? (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Close this application without approval</h2>
          <div className="flex flex-wrap gap-3">
            <ActionForm action={closeApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="outcome" value="declined" />
              <ConfirmSubmitButton confirmMessage="Mark this application as declined by the organisation?" pendingLabel="Saving…" className="rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink">Declined by the organisation</ConfirmSubmitButton>
            </ActionForm>
            <ActionForm action={closeApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="outcome" value="withdrawn" />
              <ConfirmSubmitButton confirmMessage="Mark this application as withdrawn by Ordift?" pendingLabel="Saving…" className="rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink">Withdrawn by Ordift</ConfirmSubmitButton>
            </ActionForm>
          </div>
        </section>
      ) : null}
    </div>
  );
}
