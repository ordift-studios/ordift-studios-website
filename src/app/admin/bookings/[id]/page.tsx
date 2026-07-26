import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRegistrationById, REGISTRATION_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/bookings";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { getDeliverableCategories, getDeliverablesForEntity } from "@/lib/admin/deliverables";
import DeliverablesManager from "@/components/admin/DeliverablesManager";
import { updateBookingStatusAction } from "../actions";

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
  const [registration, categories, deliverables, user] = await Promise.all([
    getRegistrationById(id),
    getDeliverableCategories(),
    getDeliverablesForEntity("workshop_registration", id),
    getCurrentUser(),
  ]);
  if (!registration) notFound();

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
            isAdmin={hasRole(user, "admin")}
          />
        </div>

        <div>
          <div className="rounded-xl border border-black/10 bg-white p-6">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3">
              Status
            </p>
            <form action={updateBookingStatusAction} className="space-y-4">
              <input type="hidden" name="registrationId" value={registration.id} />
              <div>
                <label className="font-sans text-caption text-ordift-ink-muted block mb-1">
                  Registration
                </label>
                <select
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
                <label className="font-sans text-caption text-ordift-ink-muted block mb-1">Payment</label>
                <select
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
