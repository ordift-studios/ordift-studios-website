import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRegistrationById, REGISTRATION_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/bookings";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { getDeliverableCategories, getDeliverablesForEntity } from "@/lib/admin/deliverables";
import DeliverablesManager from "@/components/admin/DeliverablesManager";
import { getProjectRequestsForEntity } from "@/lib/admin/projectRequests";
import ProjectRequestsManager from "@/components/admin/ProjectRequestsManager";
import { updateBookingStatusAction, setAmountDueAction } from "../actions";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export const metadata: Metadata = {
  title: "Booking — Ordift Studios Admin",
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

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [registration, categories, deliverables, requests, user] = await Promise.all([
    getRegistrationById(id),
    getDeliverableCategories(),
    getDeliverablesForEntity("workshop_registration", id),
    getProjectRequestsForEntity("workshop_registration", id),
    getCurrentUser(),
  ]);
  if (!registration) notFound();

  const canManageAmount = hasCapability(user, PAYMENT_CAPABILITIES, "manage_project_amount");

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/bookings" className="font-sans text-body-small text-ordift-gold-pressed underline">
          ← All Bookings
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
              Booking
            </p>
            <h1 className="font-serif font-medium text-section-heading text-ordift-ink">
              {registration.fullName}
            </h1>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
              {registration.email} · {registration.registrationReference}
            </p>
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Workshop</p>
            <p className="font-sans text-body text-ordift-ink">{registration.workshopTitle}</p>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted pt-3">
              Registered
            </p>
            <p className="font-sans text-body text-ordift-ink">{formatDateTime(registration.registrationDate)}</p>
            {registration.certificateIssued && (
              <>
                <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted pt-3">
                  Certificate
                </p>
                {registration.certificateUrl ? (
                  <a
                    href={registration.certificateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-sans text-body text-ordift-gold-pressed underline"
                  >
                    View certificate
                  </a>
                ) : (
                  <p className="font-sans text-body text-ordift-ink">Issued</p>
                )}
              </>
            )}
          </div>

          <DeliverablesManager
            entityType="workshop_registration"
            entityId={registration.id}
            deliverables={deliverables}
            categories={categories}
            isAdmin={hasRole(user, "admin") || isSuperAdmin(user)}
          />

          <ProjectRequestsManager
            entityType="workshop_registration"
            entityId={registration.id}
            requests={requests}
          />
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
                  {registration.amountDue != null ? formatUsd(registration.amountDue) : "Not set"}
                </span>
              </p>
              <p className="font-sans text-body-small text-ordift-ink-muted">
                Amount Paid:{" "}
                <span className="font-medium text-ordift-ink">{formatUsd(registration.amountPaid ?? 0)}</span>
              </p>
            </div>
            {canManageAmount ? (
              <form action={setAmountDueAction} className="space-y-3">
                <input type="hidden" name="registrationId" value={registration.id} />
                <div>
                  <label htmlFor="amount-due" className="font-sans text-caption text-ordift-ink-muted block mb-1">
                    Set Amount Due (USD)
                  </label>
                  <input
                    id="amount-due"
                    name="amountDue"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000000"
                    required
                    defaultValue={registration.amountDue ?? ""}
                    placeholder="e.g. 350.00"
                    className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-11 rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-body-small"
                >
                  {registration.amountDue != null ? "Update Amount Due" : "Set Amount Due"}
                </button>
              </form>
            ) : (
              <p className="font-sans text-caption text-ordift-ink-muted">
                Only Admin/Super Admin can set the payable amount.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-6">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3">
              Status
            </p>
            <form action={updateBookingStatusAction} className="space-y-4">
              <input type="hidden" name="registrationId" value={registration.id} />
              <div>
                <label htmlFor="registration-status" className="font-sans text-caption text-ordift-ink-muted block mb-1">
                  Registration
                </label>
                <select
                  id="registration-status"
                  name="registrationStatus"
                  defaultValue={registration.registrationStatus}
                  className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
                >
                  {REGISTRATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="payment-status" className="font-sans text-caption text-ordift-ink-muted block mb-1">
                  Payment
                </label>
                <select
                  id="payment-status"
                  name="paymentStatus"
                  defaultValue={registration.paymentStatus}
                  className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
                >
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full min-h-11 rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-body-small"
              >
                Update
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
