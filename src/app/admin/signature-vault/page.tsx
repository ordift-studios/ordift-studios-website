import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { loadOwnVault } from "@/lib/signatures/vault";
import { APPROVAL_DEFAULT_HOURS, APPROVAL_MAX_HOURS, DOCUMENT_KINDS } from "@/lib/signatures/vaultRules";
import ActionForm from "@/components/admin/ActionForm";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import { approveSignatureUseAction, registerSignatureAction, revokeSignatureApprovalAction, revokeSignatureAssetAction } from "./actions";

export const metadata: Metadata = { title: "Signature Vault — Ordift Studios Admin", robots: { index: false, follow: false } };

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const lbl = "block font-sans text-caption text-ordift-ink-muted mb-1";
const btn = "min-h-9 rounded-lg border border-black/20 px-4 font-sans text-body-small text-ordift-ink hover:bg-black/5";
const gold = "min-h-9 rounded-lg bg-ordift-gold px-4 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover";
const pill = "rounded-full px-3 py-1 font-sans text-caption font-medium";

export default async function SignatureVaultPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/portal/login?next=/admin/signature-vault");
  const view = await loadOwnVault(user.id);
  if (!view) redirect("/admin");
  const active = view.assets.filter((a) => a.status === "active");
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Signature Vault</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">Your handwritten signature, kept privately. <strong>Registering it approves nothing.</strong> Each use needs your own approval of one exact document (its SHA-256), one purpose, recipient, placement and action. An approval is single-use, expires within {APPROVAL_MAX_HOURS} hours and can be revoked. The image is never shown or linked here, and it never enters the electronic-signature engine.</p>
      </div>

      <section className="rounded-xl border border-black/10 p-5 space-y-3">
        <h2 className="font-sans text-body font-medium text-ordift-ink">Register your signature</h2>
        <ActionForm action={registerSignatureAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl} htmlFor="sv-label">Label</label><input id="sv-label" name="label" required minLength={3} maxLength={120} className={field} placeholder="e.g. Owner handwritten signature (blue ink)" /></div>
            <div><label className={lbl} htmlFor="sv-image">Image (PNG or JPEG, up to 5 MB)</label><input id="sv-image" name="image" type="file" accept="image/png,image/jpeg" required className={field} /></div>
          </div>
          <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="confirm" value="yes" className="mt-1" /> This is my own signature. Registering it grants no permission to apply it to any document.</label>
          <SubmitButton pendingLabel="Registering…" className={gold}>Register privately</SubmitButton>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-body font-medium text-ordift-ink">Registered signatures</h2>
        {view.assets.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">None registered.</p> : view.assets.map((a) => (
          <div key={a.id} className="rounded-xl border border-black/10 p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-body-small font-medium text-ordift-ink">{a.label}</span>
              <span className={`${pill} ${a.status === "active" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>{a.status === "active" ? "Active" : "Revoked"}</span>
              <span className={`${pill} bg-black/5 text-ordift-ink`}>Restricted</span>
              <span className={`${pill} bg-black/5 text-ordift-ink`}>Automatic use: off</span>
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted">{a.mime} · {Math.round(a.sizeBytes / 1024)} KB · registered <LocalTime iso={a.registeredAt} /> · SHA-256 <span className="font-mono break-all">{a.sha256}</span></p>
            {a.status === "active" && (
              <ActionForm action={revokeSignatureAssetAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="assetId" value={a.id} />
                <div className="flex-1 min-w-48"><label className={lbl} htmlFor={`rv-${a.id}`}>Reason for revoking</label><input id={`rv-${a.id}`} name="reason" required minLength={5} className={field} /></div>
                <ConfirmSubmitButton confirmMessage="Revoke this signature? Every open approval for it is revoked too. This cannot be undone." pendingLabel="Revoking…" className={btn}>Revoke signature</ConfirmSubmitButton>
              </ActionForm>
            )}
          </div>
        ))}
      </section>

      {active.length > 0 && (
        <section className="rounded-xl border border-black/10 p-5 space-y-3">
          <h2 className="font-sans text-body font-medium text-ordift-ink">Approve one use</h2>
          <p className="font-sans text-caption text-ordift-ink-muted">This approves nothing else: not another document, not a changed version of this one, not a second use. Approving does not place the signature; it only permits a separately built, approved placement step to do so once.</p>
          <ActionForm action={approveSignatureUseAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={lbl} htmlFor="ap-asset">Signature</label><select id="ap-asset" name="assetId" required className={field}>{active.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
              <div><label className={lbl} htmlFor="ap-kind">Kind of document</label><select id="ap-kind" name="documentKind" required className={field}>{DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label className={lbl} htmlFor="ap-ref">Document (name or reference)</label><input id="ap-ref" name="documentReference" required className={field} /></div>
              <div><label className={lbl} htmlFor="ap-sha">Document SHA-256 (final version, 64 characters)</label><input id="ap-sha" name="documentSha256" required pattern="[0-9a-fA-F]{64}" className={`${field} font-mono`} autoComplete="off" /></div>
              <div><label className={lbl} htmlFor="ap-purpose">Purpose of signing</label><input id="ap-purpose" name="purpose" required minLength={10} className={field} /></div>
              <div><label className={lbl} htmlFor="ap-rcpt">Intended recipient or destination</label><input id="ap-rcpt" name="recipient" required className={field} /></div>
              <div><label className={lbl} htmlFor="ap-place">Authorized placement (page and position)</label><input id="ap-place" name="placement" required className={field} /></div>
              <div><label className={lbl} htmlFor="ap-act">The specific signing action approved</label><input id="ap-act" name="action" required className={field} /></div>
              <div><label className={lbl} htmlFor="ap-hrs">Valid for (hours, at most {APPROVAL_MAX_HOURS})</label><input id="ap-hrs" name="hours" type="number" min={1} max={APPROVAL_MAX_HOURS} defaultValue={APPROVAL_DEFAULT_HOURS} className={field} /></div>
            </div>
            <ConfirmSubmitButton confirmMessage="Approve ONE use of your handwritten signature on exactly this document (this hash), for this purpose, recipient and placement?" pendingLabel="Approving…" className={gold}>Approve this one use</ConfirmSubmitButton>
          </ActionForm>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-sans text-body font-medium text-ordift-ink">Approvals</h2>
        {view.approvals.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No approvals. Nothing can be signed with your signature.</p> : view.approvals.map((p) => {
          const expired = p.expired;
          const label = p.status === "approved" ? (expired ? "Expired" : "Approved, unused") : p.status === "used" ? "Used" : "Revoked";
          return (
            <div key={p.id} className="rounded-xl border border-black/10 p-4 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-body-small font-medium text-ordift-ink">{p.documentReference}</span>
                <span className={`${pill} ${p.status === "approved" && !expired ? "bg-amber-100 text-amber-900" : p.status === "used" ? "bg-green-100 text-green-900" : "bg-black/5 text-ordift-ink"}`}>{label}</span>
                <span className="font-sans text-caption text-ordift-ink-muted">{p.documentKind}</span>
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted">Document SHA-256 <span className="font-mono break-all">{p.documentSha256}</span></p>
              <p className="font-sans text-caption text-ordift-ink-muted">{p.purpose} · to {p.recipient} · {p.placement} · {p.action}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">Approved <LocalTime iso={p.approvedAt} /> · expires <LocalTime iso={p.expiresAt} />{p.usedAt ? <> · used <LocalTime iso={p.usedAt} /></> : null}{p.signedSha256 ? <> · signed document SHA-256 <span className="font-mono break-all">{p.signedSha256}</span></> : null}</p>
              {p.status === "approved" && !expired && (
                <ActionForm action={revokeSignatureApprovalAction} className="flex flex-wrap items-end gap-2 pt-1">
                  <input type="hidden" name="approvalId" value={p.id} />
                  <div className="flex-1 min-w-48"><label className={lbl} htmlFor={`ra-${p.id}`}>Reason for revoking</label><input id={`ra-${p.id}`} name="reason" required minLength={5} className={field} /></div>
                  <ConfirmSubmitButton confirmMessage="Revoke this approval?" pendingLabel="Revoking…" className={btn}>Revoke approval</ConfirmSubmitButton>
                </ActionForm>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
