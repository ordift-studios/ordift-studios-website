import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { listMyAgreements, type MyAgreementRequiredAction } from "@/lib/legal/clientPortalAgreements";

export const metadata: Metadata = {
  title: "My Agreements — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase H (2026-09-08). Shows
// only the signed-in client's own agreements — reference, status,
// required action, signature state, amendments, whether an executed
// copy exists, and their own releases. Never another client's data,
// internal notes, a master DOCX, Admin-only data, or internal Finance
// data — enforced by real RLS via the authenticated client
// (clientPortalAgreements.ts), not a filter this page could get wrong.

const REQUIRED_ACTION_COPY: Record<MyAgreementRequiredAction, string> = {
  none: "No action needed",
  review_and_respond: "Changes requested — please review",
  sign: "Your signature is required",
  awaiting_counterparty: "Awaiting the other party",
};

export default async function ClientLegalPage() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "client")) redirect("/portal/client");

  const agreements = await listMyAgreements(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">My Agreements</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Your agreements with Ordift Studios — status, required actions, and signature progress.
        </p>
      </div>

      {agreements.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink-muted italic">You have no agreements on file yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {agreements.map((a) => (
            <div key={a.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="font-serif font-medium text-body text-ordift-ink">{a.agreementReference}</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-caption font-semibold bg-black/5 text-ordift-ink">
                  {a.status.replace(/_/g, " ")}
                </span>
              </div>

              <p className="font-sans text-body-small text-ordift-ink">
                <span className="font-semibold">Required action: </span>
                {REQUIRED_ACTION_COPY[a.requiredAction]}
              </p>

              {a.mySignatureStatus ? (
                <p className="font-sans text-body-small text-ordift-ink-muted">Your signature status: {a.mySignatureStatus}</p>
              ) : null}

              <p className="font-sans text-body-small text-ordift-ink-muted">
                {a.amendmentCount > 0 ? `${a.amendmentCount} amendment${a.amendmentCount === 1 ? "" : "s"} on record.` : "No amendments on record."}
              </p>

              <p className="font-sans text-body-small text-ordift-ink-muted">
                {a.fullyExecuted && a.executedCopyAvailable
                  ? "Executed copy available."
                  : a.fullyExecuted
                    ? "Fully executed — your executed copy is being finalized and will appear here."
                    : "Not yet fully executed."}
              </p>

              {a.releaseSummary ? (
                <div className="font-sans text-body-small text-ordift-ink-muted">
                  <p>Usage rights granted: {a.releaseSummary.usageRightsGranted.length ? a.releaseSummary.usageRightsGranted.join(", ") : "none"}</p>
                  <p>AI/synthetic rights granted: {a.releaseSummary.aiSyntheticRightsGranted.length ? a.releaseSummary.aiSyntheticRightsGranted.join(", ") : "none"}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
