import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "@/lib/instructors/featureGate";
import { SCHEDULE_SAFEGUARDING_ENABLED } from "@/lib/instructors/safeguardingGate";
import { listSchedules } from "@/lib/instructors/assignments";
import { RIGHTS_LABELS, RIGHTS_OPTIONS } from "@/lib/instructors/rules";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import ActionForm from "@/components/admin/ActionForm";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import { approveScheduleAction, closeScheduleAction, proposeScheduleAction, saveRightsAction, saveSafeguardingAction } from "./actions";

export const metadata: Metadata = { title: "Instructor Assignments — Ordift Studios Admin", robots: { index: false, follow: false } };
const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const lbl = "block font-sans text-caption text-ordift-ink-muted mb-1";
const btn = "min-h-9 rounded-lg border border-black/20 px-4 font-sans text-body-small text-ordift-ink hover:bg-black/5";
const gold = "min-h-9 rounded-lg bg-ordift-gold px-4 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover";
const pill = "rounded-full px-3 py-1 font-sans text-caption font-medium";
const OPTION_LABELS: Record<string, string> = { unset: "Not yet decided", permitted: "Permitted", not_permitted: "Not permitted", instructor_retains: "Instructor retains ownership", assigned_to_ordift: "Assigned to Ordift", licensed_to_ordift: "Licensed to Ordift", none: "No access", limited_to_session: "Limited to this session", data_processing_terms_required: "Only under signed data-processing terms" };

export default async function InstructorAssignmentsPage() {
  const user = await getCurrentUser();
  if (!user || !(await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workshopEngagementAdminister)).ok) redirect("/portal/login?next=/admin/organization/instructor-assignments");
  const schedules = await listSchedules();
  let options: { value: string; label: string }[] = [];
  if (INSTRUCTOR_FRAMEWORK_ENABLED) {
    const admin = createAdminClient();
    const { data: ags } = await admin.from("agreements").select("id, agreement_reference, status, primary_context_reference").eq("primary_context_type", "instructor_profile");
    const ids = Array.from(new Set((ags ?? []).map((a) => a.primary_context_reference as string)));
    const { data: ps } = ids.length ? await admin.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    const name = new Map((ps ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Instructor"]));
    options = (ags ?? []).map((a) => ({ value: `${a.primary_context_reference}|${a.id}`, label: `${name.get(a.primary_context_reference as string) ?? "Instructor"} — ${a.agreement_reference} (${a.status})` }));
  }
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Session Schedule / Assignments</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">Each assignment is a Session Schedule with a Rights Matrix. It is <strong>proposed</strong> until a Super Admin approves it, and approval is refused unless the framework agreement is executed, the instructor has acknowledged the adopted standards, regulatory clearance is recorded with a reference, and every right is decided with no decision flagged. Rights are never granted automatically.</p>
      </div>
      {!INSTRUCTOR_FRAMEWORK_ENABLED ? <p className="rounded-lg bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-800">This feature is not enabled yet: it needs database migration 0180 to be applied first.</p> : (
        <>
          <section className="rounded-xl border border-black/10 p-5 space-y-3">
            <h2 className="font-sans text-body font-medium text-ordift-ink">Propose an assignment</h2>
            <ActionForm action={proposeScheduleAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className={lbl} htmlFor="ps-agr">Instructor and framework agreement</label><select id="ps-agr" name="instructorAgreement" required defaultValue="" className={field}><option value="" disabled>Choose…</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className={lbl} htmlFor="ps-prog">Workshop or programme</label><input id="ps-prog" name="programmeName" required className={field} /></div>
                <div><label className={lbl} htmlFor="ps-wid">Workshop record id (optional)</label><input id="ps-wid" name="workshopId" className={field} /></div>
                <div className="sm:col-span-2"><label className={lbl} htmlFor="ps-venue">Venue or delivery location</label><input id="ps-venue" name="venue" required className={field} /></div>
                <div><label className={lbl} htmlFor="ps-first">First session (date and time, Accra)</label><input id="ps-first" name="firstSessionAt" type="datetime-local" required className={field} /></div>
                <div><label className={lbl} htmlFor="ps-last">Last session (optional)</label><input id="ps-last" name="lastSessionAt" type="datetime-local" className={field} /></div>
                <div><label className={lbl} htmlFor="ps-dur">Duration (minutes)</label><input id="ps-dur" name="durationMinutes" type="number" min={15} max={1440} required className={field} /></div>
                <div><label className={lbl} htmlFor="ps-freq">Frequency</label><input id="ps-freq" name="frequency" required placeholder="e.g. One session; weekly for 4 weeks" className={field} /></div>
                <div className="sm:col-span-2"><label className={lbl} htmlFor="ps-resp">Assigned responsibilities</label><textarea id="ps-resp" name="responsibilities" required rows={3} className={field} /></div>
                <div className="sm:col-span-2"><label className={lbl} htmlFor="ps-comp">Compensation reference (fee basis or payment obligation; never an invented figure)</label><input id="ps-comp" name="compensationReference" required className={field} /></div>
              </div>
              <SubmitButton pendingLabel="Saving…" className={gold}>Propose assignment</SubmitButton>
            </ActionForm>
          </section>
          <section id="rights-matrix" className="space-y-4 scroll-mt-24">
            <h2 className="font-sans text-body font-medium text-ordift-ink">Session Schedules and their Rights Matrix</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">Each assignment below has its own Rights Matrix: what is permitted for teaching materials, ownership, photography, recording, participant data and publication. Every permission starts undecided and is never granted automatically.</p>
            {schedules.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">None yet.</p> : schedules.map((s) => (
              <div key={s.id} className="rounded-xl border border-black/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-body-small font-medium text-ordift-ink">{s.programmeName} — {s.instructorName ?? "Instructor"}</span>
                  <span className={`${pill} ${s.status === "approved" ? "bg-green-100 text-green-900" : s.status === "proposed" ? "bg-amber-100 text-amber-900" : "bg-black/5 text-ordift-ink"}`}>{s.status === "proposed" ? "Proposed (not approved)" : s.status}</span>
                </div>
                <p className="font-sans text-caption text-ordift-ink-muted">{s.venue} · <LocalTime iso={s.firstSessionAt} /> · {s.durationMinutes} min · {s.frequency} · compensation: {s.compensationReference}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">Responsibilities: {s.responsibilities}</p>
                {s.status === "proposed" ? (
                  <>
                    <ul className="space-y-1">{s.readiness.map((r) => <li key={r.key} className={`font-sans text-caption ${r.met ? "text-green-800" : "text-amber-900"}`}>{r.met ? "✓" : "○"} {r.label}{r.detail ? ` — ${r.detail}` : ""}</li>)}</ul>
                    <ActionForm action={saveRightsAction} className="space-y-3">
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(Object.keys(RIGHTS_OPTIONS) as (keyof typeof RIGHTS_OPTIONS)[]).map((k) => (
                          <div key={k}><label className={lbl} htmlFor={`${k}-${s.id}`}>{RIGHTS_LABELS[k]}</label><select id={`${k}-${s.id}`} name={k} defaultValue={s.rights[k]} className={field}>{RIGHTS_OPTIONS[k].map((o) => <option key={o} value={o}>{OPTION_LABELS[o] ?? o}</option>)}</select></div>
                        ))}
                        <div><label className={lbl} htmlFor={`rc-${s.id}`}>Regulatory clearance</label><select id={`rc-${s.id}`} name="regulatoryClearance" defaultValue={s.regulatoryClearance} className={field}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="not_required">Not required (give the reason)</option></select></div>
                        <div><label className={lbl} htmlFor={`re-${s.id}`}>Clearance reference or reason (required to approve)</label><input id={`re-${s.id}`} name="regulatoryEvidenceReference" defaultValue={s.regulatoryEvidenceReference} className={field} /></div>
                        <div className="sm:col-span-2"><label className={lbl} htmlFor={`sr-${s.id}`}>Restrictions on sharing or reuse</label><textarea id={`sr-${s.id}`} name="sharingReuseRestrictions" rows={2} defaultValue={s.rights.sharingReuseRestrictions} className={field} /></div>
                        <div className="sm:col-span-2"><label className={lbl} htmlFor={`ap-${s.id}`}>Applicable agreement and policy references</label><textarea id={`ap-${s.id}`} name="agreementPolicyReferences" rows={2} defaultValue={s.rights.agreementPolicyReferences} className={field} /></div>
                        <div className="sm:col-span-2"><label className={lbl} htmlFor={`ud-${s.id}`}>Unresolved decisions flagged for management (any text here blocks approval)</label><textarea id={`ud-${s.id}`} name="unresolvedDecisions" rows={2} defaultValue={s.rights.unresolvedDecisions} className={field} /></div>
                      </div>
                      <SubmitButton pendingLabel="Saving…" className={btn}>Save rights and clearance</SubmitButton>
                    </ActionForm>
                    {SCHEDULE_SAFEGUARDING_ENABLED ? (
                      <ActionForm action={saveSafeguardingAction} className="space-y-3 rounded-lg bg-black/[0.03] p-3">
                        <input type="hidden" name="scheduleId" value={s.id} />
                        <p className="font-sans text-caption font-medium text-ordift-ink">Participants under 18 and venue arrangements</p>
                        <div><label className={lbl} htmlFor={`mn-${s.id}`}>May participants under 18 attend?</label><select id={`mn-${s.id}`} name="involvesMinors" defaultValue={s.safeguarding?.involvesMinors === true ? "yes" : s.safeguarding?.involvesMinors === false ? "no" : ""} className={field}><option value="">Not yet decided</option><option value="no">No</option><option value="yes">Yes, or they may</option></select></div>
                        <div><label className={lbl} htmlFor={`vs-${s.id}`}>Venue&apos;s designated safeguarding authority and procedure, or, where it has none, the external reporting route Ordift identified</label><textarea id={`vs-${s.id}`} name="venueSafeguarding" rows={2} defaultValue={s.safeguarding?.venueSafeguarding ?? ""} className={field} /></div>
                        <div><label className={lbl} htmlFor={`ve-${s.id}`}>Venue&apos;s verified emergency procedure and the local emergency numbers</label><textarea id={`ve-${s.id}`} name="venueEmergency" rows={2} defaultValue={s.safeguarding?.venueEmergency ?? ""} className={field} /></div>
                        <SubmitButton pendingLabel="Saving…" className={btn}>Save safeguarding arrangements</SubmitButton>
                      </ActionForm>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-3">
                      <ActionForm action={approveScheduleAction}><input type="hidden" name="scheduleId" value={s.id} /><ConfirmSubmitButton confirmMessage="Approve this assignment? Its terms and rights will be frozen. (Super Admin only.)" pendingLabel="Approving…" className={gold}>Approve assignment</ConfirmSubmitButton></ActionForm>
                      <ActionForm action={closeScheduleAction} className="flex items-end gap-2"><input type="hidden" name="scheduleId" value={s.id} /><input type="hidden" name="to" value="cancelled" /><div><label className={lbl} htmlFor={`cn-${s.id}`}>Cancel with a note</label><input id={`cn-${s.id}`} name="note" required minLength={5} className={field} /></div><ConfirmSubmitButton confirmMessage="Cancel this proposed assignment?" pendingLabel="Cancelling…" className={btn}>Cancel</ConfirmSubmitButton></ActionForm>
                    </div>
                  </>
                ) : (
                  <p className="font-sans text-caption text-ordift-ink-muted">Rights: {(Object.keys(RIGHTS_OPTIONS) as (keyof typeof RIGHTS_OPTIONS)[]).map((k) => `${RIGHTS_LABELS[k]}: ${OPTION_LABELS[s.rights[k]] ?? s.rights[k]}`).join(" · ")}</p>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
