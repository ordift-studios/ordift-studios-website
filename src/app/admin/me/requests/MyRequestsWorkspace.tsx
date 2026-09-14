"use client";

import { useActionState } from "react";
import { reportOwnAssetIncidentAction, requestOwnBusinessTravelAction, requestOwnPortfolioUseAction, type ActionState } from "./actions";

export interface OwnAssetAssignmentOption {
  id: string;
  label: string;
}

export interface OwnAssetIncidentView {
  id: string;
  incidentType: string;
  description: string;
  determination: string;
  reportedAt: string;
}

export interface OwnTravelAuthorizationView {
  id: string;
  destinationCountry: string;
  purpose: string;
  status: string;
  createdAt: string;
}

export interface OwnPortfolioUseView {
  id: string;
  description: string;
  status: string;
  createdAt: string;
}

function AssetIncidentForm({ assignmentOptions }: { assignmentOptions: OwnAssetAssignmentOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reportOwnAssetIncidentAction, null);
  if (assignmentOptions.length === 0) {
    return <p className="font-sans text-caption text-ordift-ink-muted">You have no currently-issued assets to report an incident against.</p>;
  }
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="assignmentId" required defaultValue="" className="sm:col-span-2 rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Which asset…</option>
        {assignmentOptions.map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>
      <input name="incidentType" required placeholder="Incident type (e.g. damage, loss)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <textarea name="description" required placeholder="Describe what happened" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" rows={2} />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-red-800 text-white disabled:opacity-50">
        {pending ? "Reporting…" : "Report Incident"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Reported.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function BusinessTravelForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestOwnBusinessTravelAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input name="destinationCountry" required placeholder="Destination country" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="purpose" required placeholder="Purpose" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input type="date" name="travelStartDate" aria-label="Travel start date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input type="date" name="travelEndDate" aria-label="Travel end date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Requesting…" : "Request Travel Authorization"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Requested.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function PortfolioUseForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestOwnPortfolioUseAction, null);
  return (
    <form action={formAction} className="space-y-2">
      <textarea name="description" required placeholder="Describe the assets/use you'd like to request for your personal portfolio" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" rows={2} />
      <button type="submit" disabled={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Requesting…" : "Submit Portfolio-Use Request"}
      </button>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Submitted.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function MyRequestsWorkspace({
  assignmentOptions,
  assetIncidents,
  travelAuthorizations,
  portfolioUseRequests,
}: {
  assignmentOptions: OwnAssetAssignmentOption[];
  assetIncidents: OwnAssetIncidentView[];
  travelAuthorizations: OwnTravelAuthorizationView[];
  portfolioUseRequests: OwnPortfolioUseView[];
}) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Report an Asset Incident</h2>
        {assetIncidents.length > 0 && (
          <ul className="space-y-1">
            {assetIncidents.map((i) => (
              <li key={i.id} className="font-sans text-caption text-ordift-ink-muted">
                · {i.incidentType} — {i.determination.replace(/_/g, " ")} · {new Date(i.reportedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        <AssetIncidentForm assignmentOptions={assignmentOptions} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Business Travel Authorization</h2>
        {travelAuthorizations.length > 0 && (
          <ul className="space-y-1">
            {travelAuthorizations.map((t) => (
              <li key={t.id} className="font-sans text-caption text-ordift-ink-muted">
                · {t.destinationCountry} — {t.purpose} — {t.status} · {new Date(t.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        <BusinessTravelForm />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Portfolio / Personal-Use IP</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Requesting does not grant automatic publication rights — every request is reviewed.</p>
        {portfolioUseRequests.length > 0 && (
          <ul className="space-y-1">
            {portfolioUseRequests.map((p) => (
              <li key={p.id} className="font-sans text-caption text-ordift-ink-muted">
                · &ldquo;{p.description}&rdquo; — {p.status} · {new Date(p.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        <PortfolioUseForm />
      </section>
    </div>
  );
}
