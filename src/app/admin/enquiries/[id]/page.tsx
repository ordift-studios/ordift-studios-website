import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { crmStageLabel } from "@/lib/portal/data";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { getEnquiryById, getEnquiryNotes, CRM_STAGES } from "@/lib/admin/enquiries";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { CRM_CAPABILITIES } from "@/lib/admin/crmPermissions";
import { getDeliverableCategories, getDeliverablesForEntity } from "@/lib/admin/deliverables";
import DeliverablesManager from "@/components/admin/DeliverablesManager";
import { getProjectRequestsForEntity } from "@/lib/admin/projectRequests";
import ProjectRequestsManager from "@/components/admin/ProjectRequestsManager";
import { addNoteAction } from "../actions";
import SetAmountDueForm from "./SetAmountDueForm";
import UpdateStageForm from "./UpdateStageForm";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export const metadata: Metadata = {
  title: "Enquiry — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminEnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [enquiry, notes, categories, deliverables, requests, user] = await Promise.all([
    getEnquiryById(id),
    getEnquiryNotes(id),
    getDeliverableCategories(),
    getDeliverablesForEntity("enquiry", id),
    getProjectRequestsForEntity("enquiry", id),
    getCurrentUser(),
  ]);

  if (!enquiry) notFound();

  const canManageAmount = hasCapability(user, PAYMENT_CAPABILITIES, "manage_project_amount");
  const canEditCrmStage = hasCapability(user, CRM_CAPABILITIES, "edit_crm_stage");

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/enquiries" className="font-sans text-body-small text-ordift-gold-pressed underline">
          ← All Enquiries
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
              Enquiry
            </p>
            <h1 className="font-serif font-medium text-section-heading text-ordift-ink">
              {enquiry.fullName}
            </h1>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
              {enquiry.email} · {enquiry.referenceNumber}
            </p>
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Service</p>
            <p className="font-sans text-body text-ordift-ink">
              {pathwayLabel(enquiry.service)}
            </p>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted pt-3">
              Submitted
            </p>
            <p className="font-sans text-body text-ordift-ink">{formatDateTime(enquiry.submittedAt)}</p>
          </div>

          <div>
            <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Notes &amp; Updates</h2>
            <form action={addNoteAction} className="mb-6 space-y-3">
              <input type="hidden" name="enquiryId" value={enquiry.id} />
              <textarea
                name="note"
                required
                rows={3}
                placeholder="Add a note…"
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink"
              />
              <fieldset className="flex gap-4 font-sans text-body-small text-ordift-ink">
                <label className="flex items-center gap-2">
                  <input type="radio" name="audience" value="internal" defaultChecked />
                  Internal Note
                  <span className="text-caption text-ordift-ink-muted">— staff/admin only</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="audience" value="client" />
                  Client Update
                  <span className="text-caption text-ordift-ink-muted">— visible to this client</span>
                </label>
              </fieldset>
              <button
                type="submit"
                className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
              >
                Add
              </button>
            </form>

            {notes.length === 0 ? (
              <p className="font-sans text-body-small text-ordift-ink-muted">No notes yet.</p>
            ) : (
              <div className="space-y-4">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full font-sans text-caption font-semibold ${
                          n.audience === "client"
                            ? "bg-ordift-gold/20 text-ordift-gold-pressed"
                            : "bg-black/10 text-ordift-ink-muted"
                        }`}
                      >
                        {n.audience === "client" ? "Client Update" : "Internal"}
                      </span>
                    </div>
                    <p className="font-sans text-body-small text-ordift-ink whitespace-pre-wrap">{n.note}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted mt-2">
                      {n.authorName ?? "Unknown"} · {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DeliverablesManager
            entityType="enquiry"
            entityId={enquiry.id}
            deliverables={deliverables}
            categories={categories}
            isAdmin={hasRole(user, "admin") || isSuperAdmin(user)}
          />

          <ProjectRequestsManager entityType="enquiry" entityId={enquiry.id} requests={requests} />
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-black/10 bg-white p-6">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3">
              Financial
            </p>
            <div className="space-y-1 mb-4">
              <p className="font-sans text-body-small text-ordift-ink-muted">
                Amount Due:{" "}
                <span className="font-medium text-ordift-ink">
                  {enquiry.amountDue != null ? formatUsd(enquiry.amountDue) : "Not set"}
                </span>
              </p>
              <p className="font-sans text-body-small text-ordift-ink-muted">
                Amount Paid: <span className="font-medium text-ordift-ink">{formatUsd(enquiry.amountPaid ?? 0)}</span>
              </p>
            </div>
            {canManageAmount ? (
              <SetAmountDueForm enquiryId={enquiry.id} currentAmountDue={enquiry.amountDue} />
            ) : (
              <p className="font-sans text-caption text-ordift-ink-muted">
                Only Admin/Super Admin can set the payable amount.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-6">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3">
              CRM Stage
            </p>
            {canEditCrmStage ? (
              <UpdateStageForm
                enquiryId={enquiry.id}
                currentStage={enquiry.crmStage}
                stageOptions={CRM_STAGES.map((s) => ({ value: s, label: crmStageLabel(s) }))}
              />
            ) : (
              <>
                <p className="font-sans text-body text-ordift-ink mb-2">{crmStageLabel(enquiry.crmStage)}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  Only Admin/Super Admin can change the CRM stage.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
