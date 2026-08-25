import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES, FINANCE_CAPABILITIES, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { getWorkshopByIdAdmin } from "@/lib/content/sanity/workshopAdmin";
import { listTicketTypesForWorkshop } from "@/lib/workshops/ticketTypes";
import { listInstructorEngagementsForWorkshop } from "@/lib/workshops/instructorEngagements";
import { getWorkshopFinancialOverview, getWorkshopOperationalWarnings } from "@/lib/workshops/financialOverview";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTicketTypeAction,
  toggleTicketTypeAction,
  createInstructorEngagementAction,
  linkEngagementPayoutObligationAction,
  approveWorkshopObligationAction,
  updateTravelAssistanceStatusAction,
  sendWorkshopNoticeAction,
} from "../actions";

export const metadata: Metadata = {
  title: "Workshop Dashboard — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Workshop Management V1, Phase B, Part 1/6/16 (2026-08-25) — the
// unified per-workshop dashboard. Read access: any staff/admin.
// Individual sections' WRITE actions each independently enforce their
// own jurisdiction capability (see actions.ts) — this page never
// bypasses that by being "unified." Financial figures and instructor
// compensation are only shown when the viewer holds finance.workshop_revenue.view
// or people.workshop_engagement.administer (or Super Admin) — visibility
// itself respects jurisdiction boundaries, not just mutation.
export default async function WorkshopDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const workshop = await getWorkshopByIdAdmin(id);
  if (!workshop) notFound();

  const [ticketTypes, engagements, canSeeFinance, canManageEngagements, canManageWorkshop, warnings] = await Promise.all([
    listTicketTypesForWorkshop(id),
    listInstructorEngagementsForWorkshop(id),
    (async () => (await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.workshopRevenueView)).ok)(),
    (async () => (await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workshopEngagementAdminister)).ok)(),
    (async () => (await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.workshopAdminister)).ok)(),
    getWorkshopOperationalWarnings(id, { capacity: workshop.capacity, requiresPayment: workshop.requiresPayment }),
  ]);
  const financialOverview = canSeeFinance ? await getWorkshopFinancialOverview(id) : null;

  // Registrations + travel assistance requests for this workshop.
  const admin = createAdminClient();
  const { data: registrationRows } = await admin
    .from("workshop_registrations")
    .select("id, registration_status, payment_status, attendance_status")
    .eq("workshop_id", id);
  const rows = registrationRows ?? [];
  const registrationSummary = {
    registered: rows.filter((r) => r.registration_status === "Registered").length,
    waitlisted: rows.filter((r) => r.registration_status === "Waitlisted").length,
    paid: rows.filter((r) => r.payment_status === "Paid").length,
    checkedIn: rows.filter((r) => r.attendance_status === "checked_in").length,
    noShow: rows.filter((r) => r.attendance_status === "no_show").length,
  };
  const ids = rows.map((r) => r.id);
  const { data: travelRequests } = ids.length
    ? await admin
        .from("workshop_travel_assistance_requests")
        .select("id, assistance_type, arrival_date, departure_date, traveller_count, status, notes")
        .in("registration_id", ids)
    : { data: [] };

  const usersResult = await listUsersWithRoles();
  const people = usersResult.ok
    ? usersResult.users.map((u) => ({ id: u.id, label: u.fullName ? `${u.fullName} (${u.email ?? "no email"})` : (u.email ?? u.id) }))
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Workshop Management</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{workshop.title}</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2">{workshop.status} · Capacity {workshop.capacity}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canManageWorkshop && (
            <Link href={`/admin/workshops/${id}/edit`} className="font-sans text-body-small font-semibold px-4 py-2.5 rounded-full border border-ordift-ink/30 text-ordift-ink">
              Edit Workshop
            </Link>
          )}
          <Link href={`/admin/bookings?workshop=${workshop.slug}`} className="font-sans text-body-small font-semibold px-4 py-2.5 rounded-full bg-ordift-navy-950 text-white">
            View Registrations
          </Link>
        </div>
      </div>

      {warnings.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Attention</h2>
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w.key} className="font-sans text-body-small text-amber-900">· {w.label}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Registrations &amp; Attendance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            ["Registered", registrationSummary.registered],
            ["Waitlisted", registrationSummary.waitlisted],
            ["Paid", registrationSummary.paid],
            ["Checked In", registrationSummary.checkedIn],
            ["No Show", registrationSummary.noShow],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="font-sans text-caption text-ordift-ink-muted">{label}</p>
              <p className="font-sans text-card-title text-ordift-ink font-medium">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {financialOverview && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Financial Overview</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-4">
            Derived from registration and payment-obligation records — never a general ledger. Instructor amounts are
            obligations, not completed payouts (no payout provider is connected).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ["Registered", financialOverview.registeredCount],
              ["Waitlisted", financialOverview.waitlistedCount],
              ["Complimentary", financialOverview.complimentaryCount],
              ["Paid", financialOverview.paidCount],
              ["Gross Revenue (USD)", `$${financialOverview.grossRegistrationRevenueUsd.toFixed(2)}`],
              ["Outstanding (USD)", `$${financialOverview.outstandingAmountUsd.toFixed(2)}`],
              ["Instructor Obligations", financialOverview.instructorObligationsCount],
              ["Obligations Total (USD)", `$${financialOverview.instructorObligationsTotalUsd.toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="font-sans text-caption text-ordift-ink-muted">{label}</p>
                <p className="font-sans text-card-title text-ordift-ink font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Ticket Types</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-4">
          {ticketTypes.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <span className={`font-sans text-body-small ${t.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>{t.name}</span>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  ${t.priceUsd.toFixed(2)} · {t.seatsReserved}{t.capacity ? `/${t.capacity}` : ""} reserved
                </p>
              </div>
              {canManageWorkshop && (
                <form action={toggleTicketTypeAction}>
                  <input type="hidden" name="ticketTypeId" value={t.id} />
                  <input type="hidden" name="workshopId" value={id} />
                  <input type="hidden" name="active" value={String(t.active)} />
                  <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                    {t.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              )}
            </li>
          ))}
          {ticketTypes.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet — registration remains open/free without one.</li>}
        </ul>
        {canManageWorkshop && (
          <form action={createTicketTypeAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="hidden" name="workshopId" value={id} />
            <input name="name" placeholder="Name (e.g. Early Bird)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
            <input type="number" name="priceUsd" placeholder="Price (USD)" min={0} step="0.01" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
            <input type="number" name="capacity" placeholder="Capacity (optional)" min={1} className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
            <button type="submit" className="sm:col-span-3 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
              Add Ticket Type
            </button>
          </form>
        )}
      </section>

      {canManageEngagements && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Instructor / Facilitator Engagement</h2>
          <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-4">
            {engagements.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <p className="font-sans text-body-small text-ordift-ink">
                  {people.find((p) => p.id === e.profileId)?.label ?? e.externalPayeeName ?? "—"} · {e.role}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {e.agreedCompensationAmount ? `${e.agreedCompensationCurrency ?? "USD"} ${e.agreedCompensationAmount}` : "No compensation set"} · {e.engagementStatus}
                  {e.paymentObligationId ? " · obligation linked" : ""}
                </p>
                {!e.paymentObligationId && e.profileId && e.agreedCompensationAmount && (
                  <form action={linkEngagementPayoutObligationAction} className="mt-1">
                    <input type="hidden" name="engagementId" value={e.id} />
                    <input type="hidden" name="workshopId" value={id} />
                    <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                      Create Payment Obligation
                    </button>
                  </form>
                )}
              </li>
            ))}
            {engagements.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
          </ul>
          <form action={createInstructorEngagementAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="hidden" name="workshopId" value={id} />
            <select name="profileId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
              <option value="">External payee (use name field instead)…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input name="externalPayeeName" placeholder="External payee name (if not staff/contractor)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
            <input name="role" placeholder="Role (e.g. Lead Instructor)" defaultValue="instructor" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
            <input type="number" name="agreedCompensationAmount" placeholder="Agreed compensation (optional)" min={0} step="0.01" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
            <button type="submit" className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
              Add Engagement
            </button>
          </form>
        </section>
      )}

      {canSeeFinance && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Payment Obligations</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-3">
            Approving here never initiates a payout — no payout provider is connected. Approval only advances the
            internal record from &ldquo;pending_approval&rdquo; to &ldquo;approved&rdquo;.
          </p>
          <ObligationsList workshopId={id} engagementIds={engagements.map((e) => e.paymentObligationId).filter((v): v is string => Boolean(v))} />
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Travel / Accommodation / Transport Assistance</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">
          Request capture only — staff arrange fulfilment manually. Updating status below emails the registrant a status update.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {(travelRequests ?? []).map((t) => (
            <li key={t.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{t.assistance_type} · {t.status}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {t.traveller_count ? `${t.traveller_count} traveller(s)` : ""} {t.arrival_date ? `· Arrives ${t.arrival_date}` : ""} {t.departure_date ? `· Departs ${t.departure_date}` : ""}
              </p>
              {canManageWorkshop && (
                <form action={updateTravelAssistanceStatusAction} className="flex items-center gap-2 mt-2">
                  <input type="hidden" name="requestId" value={t.id} />
                  <input type="hidden" name="workshopId" value={id} />
                  <select name="status" defaultValue={t.status} className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                    <option value="requested">Requested</option>
                    <option value="in_progress">In Progress</option>
                    <option value="arranged">Arranged</option>
                    <option value="declined">Declined</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                    Update &amp; Notify
                  </button>
                </form>
              )}
            </li>
          ))}
          {(!travelRequests || travelRequests.length === 0) && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
      </section>

      {canManageWorkshop && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Notify Registrants</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-3">
            Sends an email to every currently Registered or Waitlisted attendee for this workshop — e.g. for a
            cancellation or reschedule. This is a manual, staff-triggered broadcast; nothing here changes the
            workshop&rsquo;s status automatically.
          </p>
          <form action={sendWorkshopNoticeAction} className="space-y-3">
            <input type="hidden" name="workshopId" value={id} />
            <select name="noticeType" defaultValue="update" className="rounded-lg border border-black/15 bg-white px-3 py-1.5 font-sans text-body-small">
              <option value="cancelled">Workshop Cancelled</option>
              <option value="rescheduled">Workshop Rescheduled</option>
              <option value="update">General Update</option>
            </select>
            <textarea name="message" required rows={3} placeholder="Message to registrants…" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <button type="submit" className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
              Send Notice
            </button>
          </form>
        </section>
      )}

      {isSuperAdmin(user) && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          Viewing as CHIEF/Super Admin — complete visibility across every jurisdiction above. Any approval you perform
          here on behalf of an unoccupied Executive position is recorded in Activity as an explicit Super Admin
          intervention, never attributed to that jurisdiction.
        </p>
      )}
    </div>
  );
}

async function ObligationsList({ workshopId, engagementIds }: { workshopId: string; engagementIds: string[] }) {
  if (engagementIds.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">No payment obligations linked yet.</p>;
  }
  const admin = createAdminClient();
  const { data } = await admin.from("payment_obligations").select("id, description, currency, amount, status").in("id", engagementIds);
  return (
    <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
      {(data ?? []).map((o) => (
        <li key={o.id} className="flex items-center justify-between px-4 py-2.5">
          <div>
            <p className="font-sans text-body-small text-ordift-ink">{o.description}</p>
            <p className="font-sans text-caption text-ordift-ink-muted">{o.currency} {o.amount} · {o.status}</p>
          </div>
          {o.status === "pending_approval" && (
            <form action={approveWorkshopObligationAction}>
              <input type="hidden" name="obligationId" value={o.id} />
              <input type="hidden" name="workshopId" value={workshopId} />
              <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                Approve
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
