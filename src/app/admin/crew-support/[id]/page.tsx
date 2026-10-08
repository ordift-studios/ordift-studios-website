import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { getCrewSupportDetail } from "@/lib/crewSupport/admin";
import { getCommitmentSnapshot, getStatusContext } from "@/lib/crewSupport/commitmentData";
import { getCrewSupportQuotation, getCrewSupportVariation } from "@/lib/crewSupport/quotation";
import { listNotificationEvents } from "@/lib/crewSupport/notifications";
import { listActivePricingMarkets } from "@/lib/commercial/pricingCatalog";
import { listActiveCurrencies } from "@/lib/payments/currency";
import { createAdminClient } from "@/lib/supabase/admin";
import QuotationPanel from "../QuotationPanel";
import NotificationsPanel from "../NotificationsPanel";
import CommitmentPanel from "../CommitmentPanel";
import ProductionPanel from "../ProductionPanel";
import { getDeliverablesForEntity } from "@/lib/admin/deliverables";
import { isManagementUser } from "@/lib/crewSupport/management";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { loadCandidatesForRequirements, listOverridePool } from "@/lib/crewSupport/candidates";
import { validateStatusChange } from "@/lib/crewSupport/rules";
import { REQUESTER_TYPES, SERVICE_FAMILIES, STATUS_LABELS, allowedStatusTransitions, detailQuestionsFor, type CrewSupportStatus } from "@/lib/crewSupport/config";
import CrewSupportSubNav from "../CrewSupportSubNav";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { setRequestEquipmentAction, updateCrewSupportStatusAction } from "../actions";
import SlotOffer from "../SlotOffer";

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
  const detail = await getCrewSupportDetail(id);
  if (!detail) notFound();
  const candidatesByRequirement = await loadCandidatesForRequirements({
    requestId: id,
    isTest: Boolean(detail.request.is_test),
    range: { start: String(detail.request.start_date), end: String(detail.request.end_date) },
    requirements: detail.requirements.map((q) => ({ id: q.id, operationalTitleId: q.operational_title_id })),
  }).catch((error) => {
    console.error("[crew-support] candidate matching failed", error);
    return null;
  });
  const allCandidateIds = [...new Set(Object.values(candidatesByRequirement ?? {}).flatMap((c) => c.candidates.map((x) => x.profileId)))];
  const overridePool = await listOverridePool(allCandidateIds).catch(() => []);
  const r = detail.request as Record<string, string | null> & { id: string; status: CrewSupportStatus; enquiry_id: string };
  const family = SERVICE_FAMILIES.find((f) => f.value === r.service_family);
  const details = (detail.request.service_details ?? {}) as Record<string, string>;
  const questions = detailQuestionsFor(String(r.service_family));
  const [quotation, variation, notificationEvents, markets, currencies, flags, commitment, enquiryRow, deliverables] = await Promise.all([
    getCrewSupportQuotation(id),
    getCrewSupportVariation(id),
    listNotificationEvents(id),
    listActivePricingMarkets(),
    listActiveCurrencies(),
    getStatusContext(id),
    getCommitmentSnapshot(id),
    createAdminClient().from("enquiries").select("id, crm_stage, amount_due").eq("id", r.enquiry_id).maybeSingle(),
    getDeliverablesForEntity("enquiry", r.enquiry_id),
  ]);
  const enquiry = { id: String(r.enquiry_id), crmStage: String(enquiryRow.data?.crm_stage ?? "unknown"), amountDue: enquiryRow.data?.amount_due == null ? null : Number(enquiryRow.data.amount_due) };
  const nextStatuses = allowedStatusTransitions(r.status);
  const slotRules = detail.slots.map((sl) => ({ status: sl.status, assigneeProfileId: sl.assignee_profile_id }));
  const statusOptions = nextStatuses.map((to) => ({ to, check: validateStatusChange(r.status, to, slotRules, flags) }));
  const closed = ["declined", "cancelled", "confirmed", "in_production", "completed"].includes(r.status);

  return (
    <div className="space-y-6">
      <div>
        <CrewSupportSubNav active="requests" />
        <Link href="/admin/crew-support" className="mt-3 inline-block font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">← All Crew Support requests</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{r.reference_number} — {r.project_name}{detail.request.is_test ? <span className="ml-3 align-middle rounded-full bg-amber-100 px-3 py-1 font-sans text-caption text-amber-900">TEST / QA record</span> : null}</h1>
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
        {questions.some((q) => q.id === "equipment" && q.required) && !details.equipment && !["declined", "cancelled", "confirmed", "in_production", "completed"].includes(r.status) && (
          <ActionForm action={setRequestEquipmentAction} className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <input type="hidden" name="requestId" value={r.id} />
            <label className="font-sans text-caption text-amber-900">Equipment responsibility isn&apos;t recorded on this request — who supplies it?
              <select name="equipment" required defaultValue="" className={`${selectClasses} block mt-1`}>
                <option value="" disabled>Choose…</option>
                {questions.find((q) => q.id === "equipment")?.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save</SubmitButton>
          </ActionForm>
        )}
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
          const cands = candidatesByRequirement?.[req.id];
          return (
            <div key={req.id} className="rounded-lg border border-black/10 p-4 space-y-3">
              <p className="font-sans text-body-small font-medium text-ordift-ink">{req.quantity} × {req.role_label}{req.custom_role && req.custom_role !== req.role_label ? ` (${req.custom_role})` : ""}</p>
              {req.responsibilities && <p className="font-sans text-caption text-ordift-ink-muted whitespace-pre-line">{req.responsibilities}</p>}
              {candidatesByRequirement === null && <p role="alert" className="font-sans text-caption text-red-700">Candidate matching is unavailable right now. Try again shortly.</p>}
              {cands && (
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {cands.candidates.length} eligible {cands.candidates.length === 1 ? "person" : "people"} with a matching capability{req.operational_title_id ? "" : " (custom role — choose manually)"}; {cands.excludedCount} excluded (no matching capability or inactive relationship). Availability is unknown unless a conflict is shown.{" "}
                  <Link href="/admin/crew-support/capabilities" className="text-ordift-gold-pressed underline underline-offset-4">Manage capabilities</Link>
                </p>
              )}
              {slots.map((s) => (
                <SlotOffer key={s.id} requestId={r.id} role={req.role_label} locked={closed} candidates={cands?.candidates ?? []} overridePool={overridePool} currencies={currencies}
                  slot={{ id: s.id, slotNumber: s.slot_number, status: s.status, assigneeProfileId: s.assignee_profile_id, assigneeName: s.assigneeName, overrideReason: s.overrideReason, offerAmount: s.offerAmount, offerCurrency: s.offerCurrency, offeredAt: s.offeredAt, responseAt: s.responseAt, responseNote: s.responseNote, acceptedAt: s.acceptedAt, instructions: s.instructions }} />
              ))}
            </div>
          );
        })}
      </section>

      <QuotationPanel requestId={r.id} requestStatus={r.status} quotation={quotation} variation={variation} markets={markets} currencies={currencies} enquiry={enquiry} canPrepare={r.status === "availability_review" || r.status === "quote_preparation"} />

      {commitment && <CommitmentPanel snapshot={commitment} canMarkTest={isSuperAdmin(user)} canCancelConfirmed={user ? await isManagementUser(user) : false} canReviewCancellation={user ? (await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.paymentObligationApprove)).ok : false} />}

      {commitment && <ProductionPanel snapshot={commitment} enquiryId={r.enquiry_id} deliverables={deliverables} handoff={{ media: details.mediaHandoff ?? null, raw: details.rawRequired ?? null }} />}

      <NotificationsPanel requestId={r.id} events={notificationEvents} isTest={Boolean(detail.request.is_test)} />

      {nextStatuses.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Move this request forward</h2>
          <ActionForm action={updateCrewSupportStatusAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="requestId" value={r.id} />
            <select name="status" aria-label="New status" className={selectClasses} defaultValue="" required>
              <option value="" disabled>Choose a new status…</option>
              {statusOptions.map((o) => <option key={o.to} value={o.to} disabled={!o.check.ok}>{STATUS_LABELS[o.to]}{o.check.ok ? "" : " — not available yet"}</option>)}
            </select>
            <SubmitButton pendingLabel="Updating…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Update status</SubmitButton>
          </ActionForm>
          <ul className="font-sans text-caption text-ordift-ink-muted list-disc pl-5 space-y-1">
            <li>“Quote preparation” and “Quote issued” follow the quotation workspace above (prepare, mark ready, issue) — they can&apos;t be picked by hand.</li>
            <li>After the client accepts, the request moves to “Payment pending” — or to “Agreement pending” only when a separate agreement is required and not yet executed.</li>
            <li>“Confirmed” requires an accepted quotation, a contract basis, accepted crew with agreed compensation, no open slots and no firm double-booking — see Commitment readiness above.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
