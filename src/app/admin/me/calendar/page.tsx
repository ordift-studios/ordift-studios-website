import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { resolveEmployeeDateRange } from "@/lib/organization/workingDayCalendar";
import { getEarliestEmploymentTerms } from "@/lib/organization/employmentTermsHistory";
import { CalendarMonthView } from "@/app/admin/organization/calendar/CalendarMonthView";

export const metadata: Metadata = {
  title: "My Calendar — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Read-only self-service calendar (Workforce/Employee Self-Service
// Phase, 2026-09-15) — Section 19: an employee may VIEW their own
// working days, rest days, and public holidays; no edit capability
// exists here or anywhere yet. Approved leave/scheduled assignments
// are deliberately not shown — that data isn't fabricated here, and
// wiring real leave/shift data into this view is a later phase's work
// (Section 19: "Do NOT fabricate leave or shifts").
export default async function MyCalendarPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  // Genuinely no employment record at all — distinct from a date
  // merely falling outside a real employment period (2026-09-15
  // semantic correction). Showing a full grid of red "Unconfigured"
  // cells here would read as a broken page; a plain, factual notice is
  // the honest state instead. Never fabricates a commencement date,
  // jurisdiction, or working pattern to make the grid render.
  const earliestTerms = await getEarliestEmploymentTerms(user.id);
  if (!earliestTerms) {
    return (
      <div className="space-y-6">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Calendar</h1>
        </div>
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Employment calendar not configured. Complete the effective employment jurisdiction and working-pattern
            configuration to activate your working-day calendar.
          </p>
        </section>
      </div>
    );
  }

  const { year: yearParam, month: monthParam } = await searchParams;
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const resolutions = await resolveEmployeeDateRange({ profileId: user.id, startDate, endDate });

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Calendar</h1>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <CalendarMonthView year={year} month={month} resolutions={resolutions} basePath="/admin/me/calendar" employeeName={null} />
      </section>
    </div>
  );
}
