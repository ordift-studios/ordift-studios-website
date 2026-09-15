import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { resolveEmployeeDateRange } from "@/lib/organization/workingDayCalendar";
import { CalendarMonthView } from "@/app/admin/organization/calendar/CalendarMonthView";

export const metadata: Metadata = {
  title: "Employee Calendar — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Read-only admin calendar view (Workforce/Employee Self-Service
// Phase, 2026-09-15) — same authorization boundary already
// established for the Onboarding Workspace (Super Admin or
// operations.administer), not a new visibility rule invented for this
// page. READ-ONLY: no edit action exists here.
export default async function EmployeeCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { profileId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/admin/overview");
  if (!(await canManageOnboarding(currentUser.id))) redirect("/admin/overview");

  const usersResult = await listUsersWithRoles();
  const person = usersResult.ok ? usersResult.users.find((u) => u.id === profileId) : undefined;
  if (!person) notFound();

  const { year: yearParam, month: monthParam } = await searchParams;
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const resolutions = await resolveEmployeeDateRange({ profileId, startDate, endDate });

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin · Organization · Calendar
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {person.fullName ?? person.email ?? "Employee Calendar"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <Link href={`/admin/organization/people/${profileId}`} className="underline underline-offset-4">← Full Profile</Link>
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <CalendarMonthView year={year} month={month} resolutions={resolutions} basePath={`/admin/organization/calendar/${profileId}`} employeeName={null} />
      </section>
    </div>
  );
}
