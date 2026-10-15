"use client";

import { useActionState } from "react";
import { confirmApprovalNoticeAction, confirmFundingAction, recordPermitAction, uploadEntityDocumentAction, viewEntityDocumentAction, type ActionState } from "./actions";
import { ENTITY_DOCUMENT_TYPES, entityDocumentTypeLabel, type TrackedItem, type TrackedState } from "@/lib/organization/entityRegistry";

export type RegistryDocView = { id: string; documentType: string; filename: string | null; sha256: string | null; sizeBytes: number | null; issuedOn: string | null; expiresOn: string | null; issuingAuthority: string | null; relation: string | null; relatedDocumentId: string | null; replacedByDocumentId: string | null; notes: string | null; uploadedAt: string };
export type RegistrationView = { id: string; kind: string; label: string; status: string; identifier: string | null; issuedOn: string | null; expiresOn: string | null; note: string | null; facts: Record<string, unknown>; verifiedAt: string | null };
export type EntityStatusView = { entityVerification: string; employerCapable: boolean; documentCount: number };
export type SignatoryView = { id: string; fullName: string; position: string; authority: string | null; nationality: string | null; ownershipPercent: number | null };
export type ExpenseView = { id: string; expenseDate: string; amount: number; currency: string; description: string; receiptNumber: string; receiptTotal: number; payerAsShown: string | null; fundingSourceStatus: string; fundingSourceNote: string | null; accountingTreatment: string };

const input = "rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small";
const button = "justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50";
const STATE_STYLE: Record<TrackedState, string> = {
  ok: "bg-green-50 text-green-800", due_soon: "bg-amber-50 text-amber-800", overdue: "bg-red-50 text-red-800", pending: "bg-slate-100 text-slate-700",
  not_issued: "bg-slate-100 text-slate-700", date_unconfirmed: "bg-amber-50 text-amber-800", no_expiry: "bg-slate-100 text-slate-700",
};
const STATE_LABEL: Record<TrackedState, string> = { ok: "OK", due_soon: "Due soon", overdue: "Overdue", pending: "Pending", not_issued: "Not issued", date_unconfirmed: "Date needed", no_expiry: "No expiry stated" };
const FUNDING_LABEL: Record<string, string> = { to_confirm: "Payer / funding source to be confirmed", company_account: "Paid from the company account", founder_personal: "Paid personally by the Founder", other_verified: "Other (verified)" };

function Feedback({ state, pending }: { state: ActionState; pending: boolean }) {
  if (pending) return null;
  if (state?.ok === true) return <p className="sm:col-span-2 font-sans text-caption text-green-700">Saved.</p>;
  if (state?.ok === false) return <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>;
  return null;
}

function PermitForm({ entityId, permitDocs }: { entityId: string; permitDocs: RegistryDocView[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordPermitAction, null);
  return (
    <form action={action} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <select name="sourceDocumentId" required defaultValue="" className={`sm:col-span-2 ${input}`}>
        <option value="" disabled>Choose the uploaded permit document…</option>
        {permitDocs.map((d) => <option key={d.id} value={d.id}>{d.filename ?? d.id} (uploaded {new Date(d.uploadedAt).toLocaleDateString()})</option>)}
      </select>
      <input name="permitNumber" required placeholder="Permit number, exactly as printed" className={input} />
      <input name="licenceNumber" placeholder="Licence number (if separate)" className={input} />
      <input name="issuingAuthority" required placeholder="Issuing authority" className={`sm:col-span-2 ${input}`} />
      <label className="font-sans text-caption text-ordift-ink-muted">Issued on<input name="issuedOn" type="date" required className={`block w-full ${input}`} /></label>
      <label className="font-sans text-caption text-ordift-ink-muted">Expires on (if stated)<input name="expiresOn" type="date" className={`block w-full ${input}`} /></label>
      <input name="premisesAddress" required placeholder="Confirmed business premises address" className={`sm:col-span-2 ${input}`} />
      <button type="submit" disabled={pending || permitDocs.length === 0} className={button}>{pending ? "Recording…" : "Record Commercial Permit"}</button>
      {permitDocs.length === 0 && <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Upload the permit below first (document type “Commercial Permit / Licence”), then record it here.</p>}
      <Feedback state={state} pending={pending} />
    </form>
  );
}

function ApprovalNoticeForm({ entityId }: { entityId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(confirmApprovalNoticeAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <label className="font-sans text-caption text-ordift-ink-muted">Date you received the official approval notice<input name="approvalNoticeDate" type="date" required className={`block ${input}`} /></label>
      <input name="source" required placeholder="Which document or message confirms this date?" className={`min-w-72 ${input}`} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Record date"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

function UploadForm({ entityId, documents }: { entityId: string; documents: RegistryDocView[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadEntityDocumentAction, null);
  return (
    <form action={action} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <select name="documentType" required defaultValue="" className={`sm:col-span-2 ${input}`}>
        <option value="" disabled>Document type…</option>
        {ENTITY_DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png" className="sm:col-span-2 font-sans text-body-small" />
      <select name="replaces" defaultValue="" className={`sm:col-span-2 ${input}`}>
        <option value="">This is a new document (not an updated version)</option>
        {documents.filter((d) => !d.relation && !d.replacedByDocumentId).map((d) => <option key={d.id} value={d.id}>Updated version of: {entityDocumentTypeLabel(d.documentType)} — {d.filename ?? d.id}</option>)}
      </select>
      <input name="issuingAuthority" placeholder="Issuing authority (optional)" className={input} />
      <input name="notes" placeholder="Notes (optional)" className={input} />
      <label className="font-sans text-caption text-ordift-ink-muted">Issued on<input name="issuedOn" type="date" className={`block w-full ${input}`} /></label>
      <label className="font-sans text-caption text-ordift-ink-muted">Expires on<input name="expiresOn" type="date" className={`block w-full ${input}`} /></label>
      <button type="submit" disabled={pending} className={button}>{pending ? "Uploading…" : "Upload Document"}</button>
      <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">An exact copy of a document already stored is recorded as a duplicate of the original. An updated government document is stored as a new version beside the original; the original is never replaced or deleted.</p>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

function FundingForm({ entityId, receiptNumber }: { entityId: string; receiptNumber: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(confirmFundingAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="receiptNumber" value={receiptNumber} />
      <select name="status" required defaultValue="" className={input}>
        <option value="" disabled>Who funded this?</option>
        <option value="company_account">The company account</option>
        <option value="founder_personal">The Founder personally</option>
        <option value="other_verified">Someone else (verified)</option>
      </select>
      <input name="note" required placeholder="How you know (e.g. bank statement line)" className={`min-w-64 ${input}`} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Confirm"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

export function EntityRegistryPanels({
  entityId, tracked, registrations, signatories, documents, expenses, canonicalPermitPending, status,
}: {
  entityId: string; tracked: TrackedItem[]; registrations: RegistrationView[]; signatories: SignatoryView[]; documents: RegistryDocView[]; expenses: ExpenseView[]; canonicalPermitPending: boolean; status: EntityStatusView;
}) {
  const cr = registrations.find((r) => r.kind === "commercial_registration");
  const permitRow = registrations.find((r) => r.kind === "commercial_permit");
  const permit = registrations.find((r) => r.kind === "commercial_permit");
  const condition = tracked.find((t) => t.kind === "investment_approval_condition");
  const receipts = [...new Set(expenses.map((e) => e.receiptNumber))];
  const permitDocs = documents.filter((d) => d.documentType === "commercial_permit" && !d.relation);
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Status — four separate questions</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-sans text-body-small">
          <div><dt className="inline text-ordift-ink-muted">Commercial Registration: </dt><dd className="inline text-ordift-ink">{cr ? `${cr.status}${cr.verifiedAt ? " — verified against the original document" : " — not yet verified"}` : "none recorded"}</dd></div>
          <div><dt className="inline text-ordift-ink-muted">Commercial Permit: </dt><dd className="inline text-ordift-ink">{permitRow ? (permitRow.status === "active" ? "issued" : "not yet issued — awaiting the official document (this does not affect the issued registration)") : "not tracked"}</dd></div>
          <div><dt className="inline text-ordift-ink-muted">Documents in the vault: </dt><dd className="inline text-ordift-ink">{status.documentCount} record(s); integrity hash recorded for each</dd></div>
          <div><dt className="inline text-ordift-ink-muted">Employer-capable: </dt><dd className="inline text-ordift-ink">{status.employerCapable ? "yes" : "no — a separate decision, unaffected by registration or verification"}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Registrations &amp; Renewals</h2>
        {tracked.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No registrations are recorded for this entity.</p> : (
          <ul className="space-y-2">
            {tracked.map((t) => (
              <li key={t.registrationId} className="flex flex-wrap items-start gap-3">
                <span className={`font-sans text-caption font-semibold px-2 py-0.5 rounded ${STATE_STYLE[t.state]}`}>{STATE_LABEL[t.state]}</span>
                <span className="font-sans text-body-small text-ordift-ink"><strong>{t.label}</strong> — <span className="text-ordift-ink-muted">{t.detail}</span></span>
              </li>
            ))}
          </ul>
        )}
        {condition?.state === "date_unconfirmed" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="font-sans text-caption text-amber-900">The investment application you signed commits the company to be operating within 60 working days of the official approval notice. The notice date is not on record, so no deadline can be shown yet.</p>
            <ApprovalNoticeForm entityId={entityId} />
          </div>
        )}
        <ul className="space-y-1 pt-2">
          {registrations.filter((r) => r.kind !== "commercial_permit" && r.kind !== "investment_approval_condition").map((r) => (
            <li key={r.id} className="font-sans text-caption text-ordift-ink-muted">· {r.label}{r.identifier ? ` — ${r.identifier}` : ""} — {r.status}{r.issuedOn ? `, issued ${r.issuedOn}` : ""}{r.expiresOn ? `, expires ${r.expiresOn}` : ""}{typeof (r.facts.establishmentNumber ?? r.facts.entityNumber) === "string" ? ` — establishment no. ${String(r.facts.establishmentNumber ?? r.facts.entityNumber)}` : ""}{typeof r.facts.headOfficeCity === "string" ? ` — head office: ${r.facts.headOfficeCity}` : ""}{Array.isArray(r.facts.activities) ? ` — activity: ${(r.facts.activities as { code?: string; name?: string }[]).map((a) => `${a.code} ${a.name}`).join("; ")}` : ""}{r.verifiedAt ? " — verified" : ""}{typeof r.facts.capitalQar === "number" ? ` — registered share capital QAR ${r.facts.capitalQar.toLocaleString()} (capital, not an expense)` : ""}{typeof r.facts.founderReportedClarification === "string" ? ` — Founder-reported clarification (not a written amendment): ${r.facts.founderReportedClarification}` : ""}</li>
          ))}
        </ul>
      </section>

      {(permit || canonicalPermitPending) && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Commercial Permit / Licence</h2>
          {permit?.status === "active" ? (
            <div className="space-y-1">
              <p className="font-sans text-body-small text-ordift-ink">Permit {permit.identifier} — issued {permit.issuedOn}{permit.expiresOn ? `, expires ${permit.expiresOn}` : ""}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">Premises: {String(permit.facts.premises ?? "—")}</p>
            </div>
          ) : (
            <>
              <p className="font-sans text-body-small text-ordift-ink"><strong>Not yet issued.</strong> The commercial registration is recorded, but no permit, permit number, premises or approval date is on record. This entity is not shown as operationally licensed.</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-sans text-caption text-ordift-ink-muted">
                {["Permit number", "Licence number", "Issue date", "Expiry date", "Confirmed premises address"].map((f) => <div key={f} className="flex gap-2"><dt>{f}:</dt><dd className="text-ordift-ink">— <span className="text-ordift-ink-muted">(blank until supplied)</span></dd></div>)}
              </dl>
              <PermitForm entityId={entityId} permitDocs={permitDocs} />
            </>
          )}
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Authorised Signatories</h2>
        {signatories.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">None recorded for this entity.</p> : (
          <ul className="space-y-1">
            {signatories.map((s) => <li key={s.id} className="font-sans text-caption text-ordift-ink-muted">· {s.fullName} — {s.position}{s.authority ? ` — ${s.authority}` : ""}{s.ownershipPercent != null ? ` — owns ${s.ownershipPercent}%` : ""}{s.nationality ? ` (${s.nationality})` : ""}</li>)}
          </ul>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted">Names and positions only. Identity numbers stay in the private document vault.</p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Document Vault (Super Admin only)</h2>
        {documents.length > 0 ? (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-sans text-caption text-ordift-ink-muted">
                  · <strong>{entityDocumentTypeLabel(d.documentType)}</strong>{d.filename ? ` — ${d.filename}` : ""}{d.sizeBytes ? ` (${Math.round(d.sizeBytes / 1024)} KB)` : ""}{d.sha256 ? ` — #${d.sha256.slice(0, 10)}` : ""}
                  {d.issuedOn ? ` — issued ${d.issuedOn}` : ""}{d.expiresOn ? ` — expires ${d.expiresOn}` : ""} — uploaded {new Date(d.uploadedAt).toLocaleDateString()}
                  {d.relation === "exact_duplicate_of" ? " — exact duplicate of another stored document" : d.relation === "partial_overlap_of" ? " — overlaps another stored document" : d.relation === "new_version_of" ? " — newer version of an earlier document (the original is kept)" : ""}{d.replacedByDocumentId ? " — superseded by a newer version (kept)" : ""}{d.notes ? ` — "${d.notes}"` : ""}
                </span>
                <form action={viewEntityDocumentAction} target="_blank"><input type="hidden" name="documentId" value={d.id} /><button type="submit" className="font-sans text-caption font-semibold text-ordift-gold-pressed underline underline-offset-4">View / Download →</button></form>
              </li>
            ))}
          </ul>
        ) : <p className="font-sans text-body-small text-ordift-ink-muted">No documents on file yet.</p>}
        <UploadForm entityId={entityId} documents={documents} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Expenses &amp; Receipts</h2>
        {expenses.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No expenses are recorded for this entity.</p> : (
          <div className="space-y-4">
            {receipts.map((rn) => {
              const lines = expenses.filter((e) => e.receiptNumber === rn);
              const first = lines[0];
              return (
                <div key={rn} className="space-y-1">
                  <p className="font-sans text-body-small text-ordift-ink"><strong>Receipt {rn}</strong> — {first.expenseDate} — {first.currency} {first.receiptTotal.toFixed(2)}{first.payerAsShown ? ` — payer shown: ${first.payerAsShown}` : ""}</p>
                  <ul className="space-y-0.5">{lines.map((l) => <li key={l.id} className="font-sans text-caption text-ordift-ink-muted">· {l.description} — {l.currency} {l.amount.toFixed(2)}</li>)}</ul>
                  <p className="font-sans text-caption text-ordift-ink-muted">{FUNDING_LABEL[first.fundingSourceStatus] ?? first.fundingSourceStatus}{first.fundingSourceNote ? ` — ${first.fundingSourceNote}` : ""} · Accounting treatment: {first.accountingTreatment.replace(/_/g, " ")}</p>
                  {first.fundingSourceStatus === "to_confirm" && <FundingForm entityId={entityId} receiptNumber={rn} />}
                </div>
              );
            })}
          </div>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted">These are cost records backed by a receipt. They are not bank transactions, payables, reimbursements or payment instructions, and nothing here moves money.</p>
      </section>
    </div>
  );
}
