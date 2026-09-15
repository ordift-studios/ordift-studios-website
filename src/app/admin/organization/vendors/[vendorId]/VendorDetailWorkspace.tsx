"use client";

import { useActionState, useState, useRef } from "react";
import type { StaffOnboarding } from "@/lib/organization/onboarding";
import type { ResolvedRequirement, OnboardingRequirementOverrideRow } from "@/lib/organization/onboardingRequirements";
import type { VendorProfile } from "@/lib/vendors/vendorProfiles";
import type { VendorDocument } from "@/lib/vendors/vendorDocuments";
import type { PayeeProfile } from "@/lib/payables/payeeProfiles";
import { nextStage, isTerminalStage } from "@/lib/organization/onboardingStages";
import { createClient } from "@/lib/supabase/client";
import { validateVendorDocumentFile, describeVendorDocumentUploadError } from "@/lib/vendors/vendorDocumentUploadValidation";
import {
  recordVendorCompanyProfileAction,
  startVendorOnboardingAction,
  correctVendorOnboardingClassificationAction,
  advanceVendorOnboardingStageAction,
  completeVendorOnboardingAction,
  updateVendorRequirementAction,
  deferVendorRequirementAction,
  requestVendorDocumentUploadAuthorizationAction,
  recordVendorDocumentUploadAction,
  reviewVendorDocumentAction,
  setVendorStatusAction,
  createVendorPayeeProfileAction,
  type ActionState,
} from "./actions";

// Same bucket-name-as-a-local-constant convention as TalentMediaUpload.tsx
// — the client only needs the bucket's NAME (a public identifier, not a
// secret) to call supabase.storage.from(...).uploadToSignedUrl(); the
// server module that actually creates the bucket/signed URLs
// (vendorDocuments.ts) is server-only and must never be imported here.
const VENDOR_DOCUMENT_BUCKET = "vendor-documents";

type PaymentInstructionRow = { id: string; method: string; verification_status: string; is_default: boolean };
type JurisdictionOption = { id: string; name: string };

export function VendorDetailWorkspace({
  vendorId,
  vendorProfile,
  engagementTypeSlug,
  engagementTypeName,
  jurisdictionOptions,
  onboarding,
  resolvedRequirements,
  overrides,
  documents,
  payeeProfile,
  paymentInstructions,
}: {
  vendorId: string;
  vendorProfile: VendorProfile | null;
  engagementTypeSlug: string | null;
  engagementTypeName: string | null;
  jurisdictionOptions: JurisdictionOption[];
  onboarding: StaffOnboarding | null;
  resolvedRequirements: ResolvedRequirement[];
  overrides: OnboardingRequirementOverrideRow[];
  documents: VendorDocument[];
  payeeProfile: PayeeProfile | null;
  paymentInstructions: PaymentInstructionRow[];
}) {
  return (
    <div className="space-y-8">
      <IdentitySection
        vendorId={vendorId}
        vendorProfile={vendorProfile}
        engagementTypeSlug={engagementTypeSlug}
        engagementTypeName={engagementTypeName}
        jurisdictionOptions={jurisdictionOptions}
      />
      <OnboardingSection vendorId={vendorId} onboarding={onboarding} resolvedRequirements={resolvedRequirements} overrides={overrides} />
      <DocumentsSection vendorId={vendorId} documents={documents} />
      <PaymentSection vendorId={vendorId} vendorProfile={vendorProfile} payeeProfile={payeeProfile} paymentInstructions={paymentInstructions} />
    </div>
  );
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.ok !== false) return null;
  return <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>;
}

function IdentitySection({
  vendorId,
  vendorProfile,
  engagementTypeSlug,
  engagementTypeName,
  jurisdictionOptions,
}: {
  vendorId: string;
  vendorProfile: VendorProfile | null;
  engagementTypeSlug: string | null;
  engagementTypeName: string | null;
  jurisdictionOptions: JurisdictionOption[];
}) {
  const [profileState, profileAction, profilePending] = useActionState<ActionState, FormData>(recordVendorCompanyProfileAction, null);
  const [statusState, statusAction, statusPending] = useActionState<ActionState, FormData>(setVendorStatusAction, null);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Vendor Company Profile</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">
        Engagement classification: {engagementTypeName ?? "Not set"} {engagementTypeSlug ? `(${engagementTypeSlug})` : ""}
        {engagementTypeSlug && engagementTypeSlug !== "vendor_supplier" && " — vendor-specific onboarding requirements will not apply."}
      </p>

      <form action={profileAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="vendorId" value={vendorId} />
        <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
          Company / Trading name (optional — leave blank for an individual/sole provider)
          <input name="companyName" defaultValue={vendorProfile?.companyName ?? ""} className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        </label>
        <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
          Relationship Jurisdiction
          <select
            name="relationshipJurisdictionId"
            defaultValue={vendorProfile?.relationshipJurisdictionId ?? ""}
            className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small"
          >
            <option value="">Not yet set</option>
            {jurisdictionOptions.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={profilePending} className="font-sans text-caption font-semibold px-3 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {profilePending ? "Saving…" : "Record Company Profile"}
        </button>
      </form>
      <p className="font-sans text-caption text-ordift-ink-muted">
        The jurisdiction governing this Vendor/Supplier relationship — never the employee-specific &ldquo;Employment
        Jurisdiction&rdquo; field. A future Work Order may record its own override.
      </p>
      <FormError state={profileState} />

      {vendorProfile && (
        <form action={statusAction} className="flex items-center gap-2">
          <input type="hidden" name="vendorId" value={vendorId} />
          <label className="font-sans text-caption text-ordift-ink-muted">
            Status
            <select name="status" defaultValue={vendorProfile.status} className="ml-2 rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button type="submit" disabled={statusPending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md border border-black/15 text-ordift-ink disabled:opacity-50">
            {statusPending ? "Saving…" : "Update Status"}
          </button>
        </form>
      )}
      <FormError state={statusState} />
    </section>
  );
}

function StartOnboardingForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(startVendorOnboardingAction, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="vendorId" value={vendorId} />
      <p className="font-sans text-caption text-ordift-ink-muted">
        No onboarding record yet. Starting sets engagement classification to vendor_supplier and begins the
        external-contractor onboarding pipeline (Proposed → … → Active) — never routed through the employee/requisition
        pipeline.
      </p>
      <button type="submit" disabled={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Starting…" : "Start Vendor Onboarding"}
      </button>
      <FormError state={state} />
    </form>
  );
}

function CorrectClassificationForm({
  vendorId,
  onboardingId,
  currentPipeline,
  currentStatus,
  hasRequirementProgress,
}: {
  vendorId: string;
  onboardingId: string;
  currentPipeline: string;
  currentStatus: string;
  hasRequirementProgress: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(correctVendorOnboardingClassificationAction, null);
  const wasCompleted = currentStatus === "completed";
  const needsAcknowledgment = hasRequirementProgress || wasCompleted;
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <p className="font-sans text-caption text-amber-800">
        This onboarding record is on the <strong>{currentPipeline.replace(/_/g, " ")}</strong> pipeline, not
        external_contractor — it was likely started before this person&rsquo;s engagement classification was set.
        Correcting it sets engagement classification to vendor_supplier and reclassifies this record to the Vendor
        pipeline{wasCompleted ? " and reopens it (status back to in-progress, since its prior completion described the wrong pipeline)" : ""}.
        Any requirement rows already recorded on the {currentPipeline.replace(/_/g, " ")} pipeline are left exactly as
        they are (never deleted) — they simply stop being displayed once the pipeline changes, since the new pipeline
        reads a different set of requirement keys.
      </p>
      {needsAcknowledgment && (
        <label className="flex items-start gap-2 font-sans text-caption text-amber-900">
          <input type="checkbox" name="acknowledgeExistingProgress" required className="mt-0.5" />
          <span>
            {wasCompleted
              ? "This record was already marked COMPLETE on the wrong pipeline."
              : `This record already has requirement progress recorded against the ${currentPipeline.replace(/_/g, " ")} pipeline.`}{" "}
            I confirm this is known non-genuine test/QA data (not a real fact about this person) and want to
            reclassify anyway.
          </span>
        </label>
      )}
      <input
        name="reason"
        required
        placeholder="Reason — e.g. 'Started via generic requisition picker before engagement type was set; correcting to Vendor pipeline'"
        className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption"
      />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-amber-700 text-white disabled:opacity-50">
        {pending ? "Correcting…" : "Correct to Vendor Onboarding"}
      </button>
      <FormError state={state} />
    </form>
  );
}

function AdvanceStageForm({ vendorId, onboardingId, toStage }: { vendorId: string; onboardingId: string; toStage: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(advanceVendorOnboardingStageAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <input type="hidden" name="toStage" value={toStage} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Advancing…" : `Advance to "${toStage.replace(/_/g, " ")}"`}
      </button>
      <FormError state={state} />
    </form>
  );
}

function CompleteOnboardingForm({ vendorId, onboardingId }: { vendorId: string; onboardingId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(completeVendorOnboardingAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-green-700 text-white disabled:opacity-50">
        {pending ? "Completing…" : "Mark Onboarding Complete"}
      </button>
      <FormError state={state} />
    </form>
  );
}

const STATUS_STYLES: Record<string, string> = {
  satisfied: "bg-green-100 text-green-800",
  waived: "bg-black/5 text-ordift-ink-muted",
  not_applicable: "bg-black/5 text-ordift-ink-muted",
  deferred: "bg-amber-100 text-amber-800",
  pending: "bg-red-50 text-red-700",
};

function RequirementRow({ vendorId, onboardingId, pipeline, requirement }: { vendorId: string; onboardingId: string; pipeline: string; requirement: ResolvedRequirement }) {
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateVendorRequirementAction, null);
  const [deferState, deferAction, deferPending] = useActionState<ActionState, FormData>(deferVendorRequirementAction, null);

  return (
    <li className="rounded-lg border border-black/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-sans text-body-small text-ordift-ink">{requirement.label}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">{requirement.stage} · {requirement.required ? "Required" : "Optional"}{requirement.isDerived ? " · derived from real evidence" : ""}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[requirement.status] ?? "bg-black/5"}`}>
          {requirement.status.replace(/_/g, " ")}
        </span>
      </div>
      {requirement.status !== "satisfied" && requirement.status !== "waived" && requirement.status !== "not_applicable" && !requirement.isDerived && (
        <form action={updateAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="vendorId" value={vendorId} />
          <input type="hidden" name="onboardingId" value={onboardingId} />
          <input type="hidden" name="pipeline" value={pipeline} />
          <input type="hidden" name="requirementKey" value={requirement.requirementKey} />
          <select name="status" defaultValue="satisfied" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
            <option value="satisfied">Satisfied</option>
            <option value="waived">Waived</option>
            <option value="not_applicable">Not applicable</option>
          </select>
          <input name="notes" placeholder="Notes (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
          <button type="submit" disabled={updatePending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md border border-black/15 text-ordift-ink disabled:opacity-50">
            {updatePending ? "Saving…" : "Update"}
          </button>
        </form>
      )}
      <FormError state={updateState} />
      {requirement.status === "pending" && (
        <form action={deferAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="vendorId" value={vendorId} />
          <input type="hidden" name="onboardingId" value={onboardingId} />
          <input type="hidden" name="pipeline" value={pipeline} />
          <input type="hidden" name="requirementKey" value={requirement.requirementKey} />
          <input name="reason" required placeholder='Reason — e.g. "Controlled test vendor — real documentation not fabricated"' className="min-w-[22rem] rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
          <button type="submit" disabled={deferPending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-amber-100 text-amber-800 disabled:opacity-50">
            {deferPending ? "Deferring…" : "Administratively Defer"}
          </button>
        </form>
      )}
      <FormError state={deferState} />
    </li>
  );
}

function OnboardingSection({
  vendorId,
  onboarding,
  resolvedRequirements,
  overrides,
}: {
  vendorId: string;
  onboarding: StaffOnboarding | null;
  resolvedRequirements: ResolvedRequirement[];
  overrides: OnboardingRequirementOverrideRow[];
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Onboarding Lifecycle</h2>
      {!onboarding ? (
        <StartOnboardingForm vendorId={vendorId} />
      ) : onboarding.pipeline !== "external_contractor" ? (
        <CorrectClassificationForm
          vendorId={vendorId}
          onboardingId={onboarding.id}
          currentPipeline={onboarding.pipeline}
          currentStatus={onboarding.status}
          hasRequirementProgress={resolvedRequirements.some((r) => r.row !== null)}
        />
      ) : (
        <div className="space-y-4">
          <p className="font-sans text-body-small text-ordift-ink">
            Stage: <strong>{onboarding.stage.replace(/_/g, " ")}</strong> · Status: <strong>{onboarding.status}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const next = nextStage(onboarding.pipeline, onboarding.stage);
              return next ? <AdvanceStageForm vendorId={vendorId} onboardingId={onboarding.id} toStage={next} /> : null;
            })()}
            {isTerminalStage(onboarding.pipeline, onboarding.stage) && onboarding.status === "in_progress" && (
              <CompleteOnboardingForm vendorId={vendorId} onboardingId={onboarding.id} />
            )}
          </div>

          <div>
            <h3 className="font-sans text-body-small font-semibold text-ordift-ink mb-2">Onboarding Requirements</h3>
            {resolvedRequirements.length > 0 ? (
              <ul className="space-y-2">
                {resolvedRequirements.map((r) => (
                  <RequirementRow key={r.requirementKey} vendorId={vendorId} onboardingId={onboarding.id} pipeline={onboarding.pipeline} requirement={r} />
                ))}
              </ul>
            ) : (
              <p className="font-sans text-caption text-ordift-ink-muted">
                No applicable requirements — this usually means engagement classification isn&rsquo;t vendor_supplier yet.
              </p>
            )}
          </div>

          {overrides.length > 0 &&
            (() => {
              // Vendor QA correction (2026-09-15) — this record's full
              // override history spans BOTH pipelines it has ever been
              // on (the 5 preserved employee-pipeline requirement rows
              // plus their 1 override predate the correction to
              // vendor_supplier). A requirementKey that appears in the
              // CURRENT pipeline's own resolved requirements is a real,
              // current Vendor obligation; anything else is historical
              // activity from a prior pipeline, kept for its genuine
              // audit value but never presented as a live Vendor
              // requirement. Nothing here is deleted or reworded — this
              // only sorts already-preserved rows into two clearly
              // labeled groups.
              const currentKeys = new Set(resolvedRequirements.map((r) => r.requirementKey));
              const current = overrides.filter((o) => currentKeys.has(o.requirementKey));
              const historical = overrides.filter((o) => !currentKeys.has(o.requirementKey));
              return (
                <div className="space-y-4">
                  {current.length > 0 && (
                    <div>
                      <h3 className="font-sans text-body-small font-semibold text-ordift-ink mb-2">Current Vendor Deferral / Override History</h3>
                      <ul className="space-y-1">
                        {current.map((o) => (
                          <li key={o.id} className="font-sans text-caption text-ordift-ink-muted">
                            {o.requirementKey}: {o.reason} — authorized {new Date(o.authorizedAt).toLocaleDateString()}
                            {o.resolvedAt ? ` · resolved ${new Date(o.resolvedAt).toLocaleDateString()}` : " · still open"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {historical.length > 0 && (
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
                      <h3 className="font-sans text-body-small font-semibold text-ordift-ink-muted mb-1">
                        Historical Activity — Previous Employee Pipeline
                      </h3>
                      <p className="font-sans text-caption text-ordift-ink-muted mb-2">
                        Recorded before this record was corrected to the Vendor pipeline. Preserved as genuine history —
                        not a current Vendor obligation.
                      </p>
                      <ul className="space-y-1">
                        {historical.map((o) => (
                          <li key={o.id} className="font-sans text-caption text-ordift-ink-muted italic">
                            {o.requirementKey}: {o.reason} — authorized {new Date(o.authorizedAt).toLocaleDateString()}
                            {o.resolvedAt ? ` · resolved ${new Date(o.resolvedAt).toLocaleDateString()}` : " · still open"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </section>
  );
}

// Vendor QA correction (2026-09-15) — direct-to-Storage signed-URL
// upload, not a useActionState <form> like every other form here (same
// reason as TalentMediaUpload.tsx: the actual file PUT happens in the
// browser, between two server round-trips, which a single form action
// can't express). File bytes never pass through this Next.js server or
// this component's state beyond the browser's own upload.
function UploadDocumentForm({ vendorId }: { vendorId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentTypeRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileInputRef.current?.files?.[0];
    const documentType = documentTypeRef.current?.value.trim() ?? "";
    const notes = notesRef.current?.value.trim() || null;
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!documentType) {
      setError("A document type is required.");
      return;
    }
    const fileValidation = validateVendorDocumentFile(file);
    if (!fileValidation.ok) {
      setError(fileValidation.error);
      return;
    }

    setUploading(true);

    const authorization = await requestVendorDocumentUploadAuthorizationAction({ vendorId, originalFilename: file.name });
    if (!authorization.ok) {
      setError(authorization.error);
      setUploading(false);
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(VENDOR_DOCUMENT_BUCKET)
      .uploadToSignedUrl(authorization.path, authorization.token, file, { contentType: file.type });
    if (uploadError) {
      console.error("[vendors] upload to storage failed", { message: uploadError.message, status: uploadError.status, statusCode: uploadError.statusCode });
      setError(describeVendorDocumentUploadError({ message: uploadError.message, status: uploadError.status, statusCode: uploadError.statusCode }));
      setUploading(false);
      return;
    }

    const recorded = await recordVendorDocumentUploadAction({ vendorId, storagePath: authorization.path, documentType, notes });
    if (!recorded.ok) {
      setError(recorded.error);
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (documentTypeRef.current) documentTypeRef.current.value = "";
    if (notesRef.current) notesRef.current.value = "";
  }

  return (
    <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        Document type
        <input ref={documentTypeRef} name="documentType" required placeholder="e.g. company_registration" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        File
        <input ref={fileInputRef} name="file" type="file" required className="font-sans text-body-small" />
      </label>
      <input ref={notesRef} name="notes" placeholder="Notes (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={uploading} className="font-sans text-caption font-semibold px-3 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {uploading ? "Uploading…" : "Upload"}
      </button>
      {success && <p className="font-sans text-caption text-green-700 w-full">Uploaded.</p>}
      {error && <p className="font-sans text-caption text-red-700 w-full">{error}</p>}
    </form>
  );
}

function DocumentRow({ vendorId, document }: { vendorId: string; document: VendorDocument }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reviewVendorDocumentAction, null);
  return (
    <li className="rounded-lg border border-black/10 p-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-sans text-body-small text-ordift-ink">{document.documentType}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">Uploaded {new Date(document.uploadedAt).toLocaleDateString()}{document.notes ? ` — ${document.notes}` : ""}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${document.status === "approved" ? "bg-green-100 text-green-800" : document.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
          {document.status.replace(/_/g, " ")}
        </span>
        {document.status === "pending_review" && (
          <form action={formAction} className="flex items-center gap-1">
            <input type="hidden" name="vendorId" value={vendorId} />
            <input type="hidden" name="documentId" value={document.id} />
            <button type="submit" name="status" value="approved" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-green-700 text-white disabled:opacity-50">
              Approve
            </button>
            <button type="submit" name="status" value="rejected" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-red-700 text-white disabled:opacity-50">
              Reject
            </button>
          </form>
        )}
      </div>
      <FormError state={state} />
    </li>
  );
}

function DocumentsSection({ vendorId, documents }: { vendorId: string; documents: VendorDocument[] }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Documents / Evidence</h2>
      <UploadDocumentForm vendorId={vendorId} />
      {documents.length > 0 ? (
        <ul className="space-y-2">
          {documents.map((d) => (
            <DocumentRow key={d.id} vendorId={vendorId} document={d} />
          ))}
        </ul>
      ) : (
        <p className="font-sans text-caption text-ordift-ink-muted">No documents uploaded yet.</p>
      )}
    </section>
  );
}

function CreatePayeeProfileForm({ vendorId, companyName }: { vendorId: string; companyName: string | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createVendorPayeeProfileAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="companyName" value={companyName ?? ""} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create Payee Profile (Universal Payables)"}
      </button>
      <FormError state={state} />
    </form>
  );
}

function PaymentSection({
  vendorId,
  vendorProfile,
  payeeProfile,
  paymentInstructions,
}: {
  vendorId: string;
  vendorProfile: VendorProfile | null;
  payeeProfile: PayeeProfile | null;
  paymentInstructions: PaymentInstructionRow[];
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Payment Readiness</h2>
      {payeeProfile ? (
        <p className="font-sans text-body-small text-ordift-ink">Payee profile: {payeeProfile.category} · {payeeProfile.status}</p>
      ) : (
        <div className="space-y-2">
          <p className="font-sans text-caption text-ordift-ink-muted">No Universal Payables payee profile yet.</p>
          <CreatePayeeProfileForm vendorId={vendorId} companyName={vendorProfile?.companyName ?? null} />
        </div>
      )}
      {paymentInstructions.length > 0 ? (
        <ul className="space-y-1">
          {paymentInstructions.map((p) => (
            <li key={p.id} className="font-sans text-caption text-ordift-ink-muted">
              {p.method} · {p.verification_status} {p.is_default ? "· default" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-sans text-caption text-ordift-ink-muted">No payment destination configured yet — the vendor records this from their own portal (Payment Details).</p>
      )}
    </section>
  );
}
