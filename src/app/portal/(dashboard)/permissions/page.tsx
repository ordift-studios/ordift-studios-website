import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { PERMISSION_TEXT, PERMISSION_TEXT_APPROVED } from "@/lib/portfolio/permissionText";
import { DESTINATION_LABEL, type Destination } from "@/lib/portfolio/destinations";
import { getMyPermissionView } from "@/lib/portfolio/portalRequests";
import { AnswerForm, WithdrawForm } from "./Forms";

export const metadata: Metadata = { title: "Photograph permissions — Ordift Studios Portal", robots: { index: false, follow: false } };

// Optional. Ordift Studios asks here, never by surprise: a request exists only when an authorised person created it for this account, and answering "no"
// (or not answering) changes nothing about the photographs and services you are owed.
export default async function PermissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  // The page does not exist until the portfolio library is switched on AND the wording is approved: before then the platform records nothing about permission,
  // and a page saying "no permission recorded from you" would be misleading.
  if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_TEXT_APPROVED) notFound();
  const view = await getMyPermissionView(user.id);
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Photograph permissions</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">{PERMISSION_TEXT.intro}</p>
      </div>
      {view.requests.length === 0 && view.given.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">There is nothing for you to answer, and no permission recorded from you.</p>}
      {view.requests.map((r) => (
        <section key={r.id} className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">{PERMISSION_TEXT.title}</h2>
          <p className="font-sans text-body-small">Project: <strong>{r.jobTitle}</strong></p>
          <p className="font-sans text-body-small text-ordift-ink-muted">{PERMISSION_TEXT.scope}</p>
          <AnswerForm requestId={r.id} offered={r.destinations} />
          <p className="font-sans text-caption text-ordift-ink-muted">{PERMISSION_TEXT.withdrawal}</p>
        </section>
      ))}
      {view.given.length > 0 && (
        <section className="space-y-3"><h2 className="font-serif font-medium text-body text-ordift-ink">Permissions you have given</h2>
          <ul className="space-y-2">{view.given.map((g) => (
            <li key={g.id} className="rounded-xl border border-black/10 bg-white p-4 space-y-1">
              <p className="font-sans text-body-small font-medium">{g.jobTitle}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">Given {g.recordedAt.slice(0, 10)} · {g.destinations.map((d) => DESTINATION_LABEL[d as Destination] ?? d).join(", ")}{g.restrictions ? ` · limits: ${g.restrictions}` : ""}</p>
              {g.withdrawn ? <p className="font-sans text-caption text-ordift-ink-muted">You withdrew this permission.</p> : <WithdrawForm recordId={g.id} />}
            </li>))}</ul>
        </section>
      )}
    </div>
  );
}
