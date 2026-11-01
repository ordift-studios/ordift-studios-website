import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "@/lib/instructors/featureGate";
import { listStandardsVersions, type StandardsVersion } from "@/lib/instructors/standards";
import { adoptionBlockers } from "@/lib/instructors/rules";
import ActionForm from "@/components/admin/ActionForm";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import { adoptStandardsAction, createStandardsDraftAction, retireStandardsAction, updateStandardsDraftAction } from "./actions";

export const metadata: Metadata = { title: "Instructor Standards — Ordift Studios Admin", robots: { index: false, follow: false } };
const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const lbl = "block font-sans text-caption text-ordift-ink-muted mb-1";
const btn = "min-h-9 rounded-lg border border-black/20 px-4 font-sans text-body-small text-ordift-ink hover:bg-black/5";
const gold = "min-h-9 rounded-lg bg-ordift-gold px-4 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover";
const pill = "rounded-full px-3 py-1 font-sans text-caption font-medium";

function ContactFields({ v, p }: { v?: StandardsVersion; p: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className={lbl} htmlFor={`${p}-dc`}>Designated Ordift contact (name, role, phone, email)</label><input id={`${p}-dc`} name="designatedContact" defaultValue={v?.designatedContact} className={field} /></div>
      <div><label className={lbl} htmlFor={`${p}-sc`}>Safeguarding contact</label><input id={`${p}-sc`} name="safeguardingContact" defaultValue={v?.safeguardingContact} className={field} /></div>
      <div><label className={lbl} htmlFor={`${p}-ec`}>Escalation contact / route (including out of hours)</label><input id={`${p}-ec`} name="escalationContact" defaultValue={v?.escalationContact} className={field} /></div>
      <div><label className={lbl} htmlFor={`${p}-ei`}>Emergency instructions</label><input id={`${p}-ei`} name="emergencyInstructions" defaultValue={v?.emergencyInstructions} className={field} /></div>
    </div>
  );
}

export default async function InstructorStandardsPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/portal/login?next=/admin/organization/instructor-standards");
  const versions = await listStandardsVersions();
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Independent Instructor Standards</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">One set of standards for every independent instructor (employee HR policies do not apply to them). A version is a draft until you adopt it; the system refuses adoption while any <span className="font-mono">[[DECISION …]]</span> placeholder remains or any contact is missing. Instructors acknowledge the adopted version in their portal before their first workshop assignment. Signing their framework agreement does not depend on it.</p>
      </div>
      {!INSTRUCTOR_FRAMEWORK_ENABLED ? <p className="rounded-lg bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-800">This feature is not enabled yet: it needs database migration 0180 to be applied first.</p> : (
        <>
          <section className="rounded-xl border border-black/10 p-5 space-y-3">
            <h2 className="font-sans text-body font-medium text-ordift-ink">New draft version</h2>
            <ActionForm action={createStandardsDraftAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={lbl} htmlFor="nv-label">Version label (for example 1.0)</label><input id="nv-label" name="versionLabel" required className={field} /></div>
                <div><label className={lbl} htmlFor="nv-title">Title</label><input id="nv-title" name="title" required defaultValue="Independent Instructor Standards" className={field} /></div>
              </div>
              <div><label className={lbl} htmlFor="nv-body">Full text</label><textarea id="nv-body" name="bodyText" required rows={14} className={`${field} font-mono`} /></div>
              <ContactFields p="nv" />
              <SubmitButton pendingLabel="Saving…" className={gold}>Save draft</SubmitButton>
            </ActionForm>
          </section>
          <section className="space-y-4">
            <h2 className="font-sans text-body font-medium text-ordift-ink">Versions</h2>
            {versions.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No versions yet.</p> : versions.map((v) => {
              const blockers = v.status === "draft" ? adoptionBlockers(v.bodyText, v) : [];
              return (
                <div key={v.id} className="rounded-xl border border-black/10 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-sans text-body-small font-medium text-ordift-ink">{v.title} — version {v.versionLabel}</span>
                    <span className={`${pill} ${v.status === "adopted" ? "bg-green-100 text-green-900" : v.status === "draft" ? "bg-amber-100 text-amber-900" : "bg-black/5 text-ordift-ink"}`}>{v.status}</span>
                    <span className="font-sans text-caption text-ordift-ink-muted">{v.acknowledgements} acknowledgement(s)</span>
                  </div>
                  <p className="font-sans text-caption text-ordift-ink-muted">SHA-256 <span className="font-mono break-all">{v.bodySha256}</span>{v.adoptedAt ? <> · adopted <LocalTime iso={v.adoptedAt} /></> : null}{v.retiredAt ? <> · retired <LocalTime iso={v.retiredAt} /></> : null}</p>
                  {v.status === "draft" && (
                    <>
                      {blockers.length > 0 ? <ul className="list-disc pl-5 font-sans text-caption text-amber-900">{blockers.map((b) => <li key={b}>{b}</li>)}</ul> : <p className="font-sans text-caption text-green-800">Complete: ready to adopt.</p>}
                      <ActionForm action={updateStandardsDraftAction} className="space-y-3">
                        <input type="hidden" name="versionId" value={v.id} />
                        <div><label className={lbl} htmlFor={`t-${v.id}`}>Title</label><input id={`t-${v.id}`} name="title" defaultValue={v.title} className={field} /></div>
                        <div><label className={lbl} htmlFor={`b-${v.id}`}>Full text</label><textarea id={`b-${v.id}`} name="bodyText" rows={12} defaultValue={v.bodyText} className={`${field} font-mono`} /></div>
                        <ContactFields v={v} p={v.id} />
                        <SubmitButton pendingLabel="Saving…" className={btn}>Save changes</SubmitButton>
                      </ActionForm>
                      <ActionForm action={adoptStandardsAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="versionId" value={v.id} />
                        <div className="flex-1 min-w-56"><label className={lbl} htmlFor={`n-${v.id}`}>Adoption note (who approved this, on what basis)</label><input id={`n-${v.id}`} name="note" required minLength={5} className={field} /></div>
                        <ConfirmSubmitButton confirmMessage="Adopt this version? Its text is frozen and independent instructors will be asked to acknowledge it." pendingLabel="Adopting…" className={gold}>Adopt</ConfirmSubmitButton>
                      </ActionForm>
                    </>
                  )}
                  {v.status === "adopted" && (
                    <ActionForm action={retireStandardsAction}>
                      <input type="hidden" name="versionId" value={v.id} />
                      <ConfirmSubmitButton confirmMessage="Retire this version? No instructor can be assigned until a new version is adopted and acknowledged." pendingLabel="Retiring…" className={btn}>Retire this version</ConfirmSubmitButton>
                    </ActionForm>
                  )}
                  <details className="rounded-md border border-black/10 bg-ordift-offwhite p-3"><summary className="cursor-pointer font-sans text-caption text-ordift-ink">Read the text</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-body-small text-ordift-ink">{v.bodyText}</pre></details>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
