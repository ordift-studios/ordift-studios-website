import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { getCrewSupportDetail, listAssignableProfiles } from "@/lib/crewSupport/admin";
import { REQUESTER_TYPES, SERVICE_FAMILIES, SLOT_STATUSES, SLOT_STATUS_LABELS, STATUS_LABELS, allowedStatusTransitions, detailQuestionsFor, type CrewSupportStatus } from "@/lib/crewSupport/config";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { updateCrewSupportSlotAction, updateCrewSupportStatusAction } from "../actions";

export const metadata: Metadata = { title: "Crew Support Request — Ordift Studios Admin", robots: { index: false, follow: false } };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{label}</dt>
      <dd className="font-sans text-body-small text-ordift-ink mt-0.5 whitespace-pre-line">{value}</dd>
    </div>
  );
}

const selectClasses = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";

export default async function CrewSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user)) redirect("/admin/overview");
  const { id } = await params;
  const [detail, people] = await Promise.all([getCrewSupportDetail(id), listAssignableProfiles()]);
  if (!detail) notFound();
  const r = detail.request as Record<string, string | null> & { id: string; status: CrewSupportStatus; enquiry_id: string };
  const family = SERVICE_FAMILIES.find((f) => f.value === r.service_family);
  const details = (detail.request.service_details ?? {}) as Record<string, string>;
  const questions = detailQuestionsFor(String(r.service_family));
  const nextStatuses = allowedStatusTransitions(r.status);
  const closed = r.status === "declined" || r.status === "cancelled";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/crew-support" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">← All Crew Support requests</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{r.reference_number} — {r.project_name}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          Status: <strong className="text-ordift-ink">{STATUS_LABELS[r.status]}</strong> · Ordift is the <strong>supporting</strong> party — the requester leads this engagement. Availability is not guaranteed until confirmed here.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="Requester" value={`${r.requester_name} (${REQUESTER_TYPES.find((t) => t.value === r.requester_type)?.label ?? r.requester_type})`} />
          <Row label="Contact" value={`${r.requester_email} · ${r.requester_phone}`} />
          <Row label="Company" value={r.requester_company} />
          <Row label="Lead company / studio" value={r.lead_company} />
          <Row label="Service area" value={family?.label ?? r.service_family} />
          <Row label="Project type" value={r.project_type} />
          <Row label="Dates" value={r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`} />
          <Row label="Call / finish" value={[r.call_time, r.finish_time].filter(Boolean).join(" → ")} />
          <Row label="Location" value={r.location} />
          <Row label="Lead contact on site" value={r.on_site_contact} />
          <Row label="Urgency" value={r.urgency} />
          <Row label="Budget / rate noted by requester" value={r.budget_note} />
          <Row label="Project description" value={r.project_description} />
          <Row label="Requester notes" value={r.requester_notes} />
          {questions.filter((q) => details[q.id]).map((q) => <Row key={q.id} label={q.label} value={details[q.id]} />)}
        </dl>
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          Quote, agreement and payment run through the linked enquiry:{" "}
          <Link href={`/admin/enquiries/${r.enquiry_id}`} className="text-ordift-gold-pressed underline underline-offset-4">open enquiry</Link>.
          No Crew Support rates are configured — do not reuse consumer Photography/Film rates as crew prices. A Crew Support agreement template needs Counsel review before any agreement is issued.
        </p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Crew requirements and assignment</h2>
        {detail.requirements.map((req) => {
          const slots = detail.slots.filter((s) => s.requirement_id === req.id);
          return (
            <div key={req.id} className="rounded-lg border border-black/10 p-4 space-y-3">
              <p className="font-sans text-body-small font-medium text-ordift-ink">{req.quantity} × {req.role_label}{req.custom_role && req.custom_role !== req.role_label ? ` (${req.custom_role})` : ""}</p>
              {req.responsibilities && <p className="font-sans text-caption text-ordift-ink-muted whitespace-pre-line">{req.responsibilities}</p>}
              {slots.map((s) => (
                <ActionForm key={`${s.id}-${s.status}-${s.assignee_profile_id}`} action={updateCrewSupportSlotAction} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center border-t border-black/5 pt-3">
                  <input type="hidden" name="slotId" value={s.id} />
                  <input type="hidden" name="requestId" value={r.id} />
                  <p className="font-sans text-body-small text-ordift-ink">{req.role_label} {s.slot_number} — <strong>{SLOT_STATUS_LABELS[s.status]}</strong>{s.assigneeName ? ` · ${s.assigneeName}` : ""}</p>
                  <select name="assigneeProfileId" defaultValue={s.assignee_profile_id ?? ""} disabled={closed} aria-label={`Person for ${req.role_label} ${s.slot_number}`} className={selectClasses}>
                    <option value="">No one selected</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select name="status" defaultValue={s.status} disabled={closed} aria-label={`Slot status for ${req.role_label} ${s.slot_number}`} className={selectClasses}>
                    {SLOT_STATUSES.map((st) => <option key={st} value={st}>{SLOT_STATUS_LABELS[st]}</option>)}
                  </select>
                  <input name="note" defaultValue={s.note ?? ""} disabled={closed} placeholder="Note (optional)" aria-label="Note" className={selectClasses} />
                  {!closed && <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save slot</SubmitButton>}
                </ActionForm>
              ))}
            </div>
          );
        })}
      </section>

      {nextStatuses.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Move this request forward</h2>
          <ActionForm action={updateCrewSupportStatusAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="requestId" value={r.id} />
            <select name="status" aria-label="New status" className={selectClasses} defaultValue={nextStatuses[0]}>
              {nextStatuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <SubmitButton pendingLabel="Updating…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Update status</SubmitButton>
          </ActionForm>
          <p className="font-sans text-caption text-ordift-ink-muted">“Confirmed” requires at least one assigned crew member and no open slots.</p>
        </section>
      )}
    </div>
  );
}
