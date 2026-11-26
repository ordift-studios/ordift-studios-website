import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { canLicenseActivity, type EvidenceOption, type RegisterRow } from "@/lib/organization/activityRegisterView";
import { recordActivityAction } from "./actions";

// The entity's activity register. Read-only facts first (what the verified evidence shows), then the internal record, then the Super Admin form.
// Entering a record here is record-keeping: it does not grant or create any authorization, and it never lets an unverified activity pass the quotation check.
const input = "rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small";
const button = "justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white";

const CHIP: Record<RegisterRow["effective"], string> = {
  licensed: "bg-green-50 text-green-800", listed_on_registration: "bg-green-50 text-green-800", planned: "bg-slate-100 text-slate-700", suspended: "bg-amber-50 text-amber-800", not_licensed: "bg-red-50 text-red-800", not_judged: "bg-slate-100 text-slate-700",
};
const CHIP_LABEL: Record<RegisterRow["effective"], string> = {
  licensed: "Licensed", listed_on_registration: "Listed on registration", planned: "Planned", suspended: "Suspended", not_licensed: "Not licensed", not_judged: "Not judged here",
};
const STATE_TEXT: Record<EvidenceOption["state"], string> = { usable: "verified, in date", unverified: "not verified", expired: "expired", not_active: "not the active record" };

export function ActivityRegisterPanel({ entityId, jurisdiction, rows, evidence }: { entityId: string; jurisdiction: string | null; rows: RegisterRow[]; evidence: EvidenceOption[] }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4" aria-labelledby="activity-register-heading" data-testid="activity-register">
      <div className="space-y-1">
        <h2 id="activity-register-heading" className="font-serif font-medium text-body text-ordift-ink">Activity register{jurisdiction ? ` · ${jurisdiction}` : ""}</h2>
        <p className="font-sans text-caption text-ordift-ink-muted max-w-3xl">
          Two things are kept apart here. The <strong>evidence</strong> is what the authority issued (the Commercial Registration, the Commercial Permit) and whether it has been verified. The <strong>record</strong> is what Ordift has written down about an
          activity. Entering a record is record-keeping: it does not grant authorization, and an activity is recorded as licensed only against verified, in-date evidence that lists it. Whether a quotation may cover an activity is decided by the quotation check, not by this page.
        </p>
      </div>
      <ul className="divide-y divide-black/5">
        {rows.map((r) => {
          const options = evidence.filter((e) => e.state === "usable" && canLicenseActivity(e.kind) && (e.listsActivities === null || e.listsActivities.includes(r.key)));
          return (
            <li key={r.key} className="py-4 space-y-2" data-testid={`activity-${r.key}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-sans text-body-small font-medium text-ordift-ink">{r.label}{r.printedCode ? <span className="ml-2 font-normal text-ordift-ink-muted">registered activity code {r.printedCode}</span> : null}</p>
                <span className={`px-2.5 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${CHIP[r.effective]}`}>{CHIP_LABEL[r.effective]}</span>
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted">{r.effectiveText}</p>
              {r.record ? (
                <p className="font-sans text-caption text-ordift-ink">
                  Record: <strong>{r.record.status}</strong>
                  {r.record.evidence ? ` · evidence: ${r.record.evidence.label}${r.record.evidence.identifier ? ` ${r.record.evidence.identifier}` : ""} (${STATE_TEXT[r.record.evidence.state]}${r.record.evidence.expiresOn ? `, valid to ${r.record.evidence.expiresOn}` : ""})` : ""}
                  {r.record.recordedByLabel ? ` · recorded by ${r.record.recordedByLabel}` : ""}{r.record.updatedAt ? ` · ${r.record.updatedAt.slice(0, 10)}` : ""}
                  {r.record.note ? ` · ${r.record.note}` : ""}
                </p>
              ) : (
                <p className="font-sans text-caption text-ordift-ink-muted">No record has been entered for this activity.</p>
              )}
              {r.warnings.map((w) => <p key={w} className="rounded-lg border border-amber-600/30 bg-amber-50 px-3 py-2 font-sans text-caption text-amber-900">{w}</p>)}
              <details className="rounded-lg border border-black/10 px-3 py-2">
                <summary className="cursor-pointer font-sans text-caption text-ordift-ink">{r.record ? "Change this record" : "Enter a record"}</summary>
                <ActionForm action={recordActivityAction} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="hidden" name="entityId" value={entityId} />
                  <input type="hidden" name="activityKey" value={r.key} />
                  <select name="status" required defaultValue={r.record?.status ?? ""} className={input} aria-label={`Status for ${r.label}`}>
                    <option value="" disabled>Choose a status…</option>
                    <option value="planned">Planned (an intention, never counted as licensed)</option>
                    <option value="licensed">Licensed (needs verified evidence)</option>
                    <option value="suspended">Suspended</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                  <select name="evidenceRegistrationId" defaultValue={r.record?.evidence?.id ?? ""} className={input} aria-label={`Evidence for ${r.label}`}>
                    <option value="">No evidence (required only for Licensed)</option>
                    {options.map((e) => <option key={e.id} value={e.id}>{e.label}{e.identifier ? ` ${e.identifier}` : ""}{e.expiresOn ? ` · valid to ${e.expiresOn}` : ""}</option>)}
                  </select>
                  <input name="note" maxLength={400} placeholder="Note (optional)" className={`sm:col-span-2 ${input}`} aria-label="Note" />
                  {r.record ? <input name="reason" required minLength={8} maxLength={400} placeholder="Why is this changing? (required)" className={`sm:col-span-2 ${input}`} aria-label="Reason for the change" /> : null}
                  {!r.record && r.effective === "listed_on_registration" ? (
                    <p className="sm:col-span-2 rounded-lg border border-amber-600/30 bg-amber-50 px-3 py-2 font-sans text-caption text-amber-900" data-testid="override-warning">
                      This activity currently counts because the verified Commercial Registration lists it. Once any record exists it replaces that: only <strong>Licensed</strong>, against verified in-date evidence, keeps it quotable. Planned, Suspended and Withdrawn all stop it being quoted, and a record can never be deleted.
                    </p>
                  ) : null}
                  {options.length === 0 ? <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">No verified, in-date evidence on file lists this activity, so it cannot be recorded as licensed.</p> : null}
                  <SubmitButton pendingLabel="Saving…" className={button}>Save record</SubmitButton>
                </ActionForm>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
