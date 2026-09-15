"use client";

import { useActionState } from "react";
import type { StaffOnboarding } from "@/lib/organization/onboarding";
import type { ResolvedRequirement } from "@/lib/organization/onboardingRequirements";
import type { VendorDocument } from "@/lib/vendors/vendorDocuments";
import { uploadOwnVendorDocumentAction, type ActionState } from "./actions";

const STAGE_LABELS: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  invited: "Invited",
  profile: "Profile",
  payment_setup: "Payment Setup",
  engagement_assigned: "Engagement Assigned",
  active: "Active (onboarding complete)",
};

const STATUS_STYLES: Record<string, string> = {
  satisfied: "bg-green-100 text-green-800",
  waived: "bg-black/5 text-ordift-ink-muted",
  not_applicable: "bg-black/5 text-ordift-ink-muted",
  deferred: "bg-amber-100 text-amber-800",
  pending: "bg-red-50 text-red-700",
};

function UploadForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadOwnVendorDocumentAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        Document type
        <input name="documentType" required placeholder="e.g. company_registration" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        File
        <input name="file" type="file" required className="font-sans text-body-small" />
      </label>
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Uploading…" : "Upload"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700 w-full">{state.error}</p>}
    </form>
  );
}

export function VendorOnboardingStatus({
  onboarding,
  resolvedRequirements,
  documents,
}: {
  vendorId: string;
  onboarding: StaffOnboarding | null;
  resolvedRequirements: ResolvedRequirement[];
  documents: VendorDocument[];
}) {
  if (!onboarding) {
    return (
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Onboarding</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Onboarding has not started yet. Ordift Studios will begin this once your engagement is confirmed.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Onboarding</h2>
      <p className="font-sans text-body-small text-ordift-ink">
        Stage: <strong>{STAGE_LABELS[onboarding.stage] ?? onboarding.stage}</strong>
      </p>

      {resolvedRequirements.length > 0 && (
        <ul className="space-y-2">
          {resolvedRequirements.map((r) => (
            <li key={r.requirementKey} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 p-3">
              <span className="font-sans text-body-small text-ordift-ink">{r.label}</span>
              <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[r.status] ?? "bg-black/5"}`}>
                {r.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="font-sans text-body-small font-semibold text-ordift-ink mb-2">Documents</h3>
        <UploadForm />
        {documents.length > 0 && (
          <ul className="space-y-1 mt-3">
            {documents.map((d) => (
              <li key={d.id} className="font-sans text-caption text-ordift-ink-muted">
                {d.documentType} — {d.status.replace(/_/g, " ")} (uploaded {new Date(d.uploadedAt).toLocaleDateString()})
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
