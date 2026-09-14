import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listAttendanceRecordsForProfile } from "@/lib/organization/attendance";
import { MyAttendanceWorkspace } from "./MyAttendanceWorkspace";

export const metadata: Metadata = {
  title: "My Attendance — Ordift Studios",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 14 (2026-09-14) —
// Employee Self-Service: My Attendance. Every read/write is always
// scoped to the CURRENT user's own id — never a profileId taken from
// the request. Attendance facts (late, early departure) are shown
// separately from any payroll treatment, which never appears here —
// same separation the admin Attendance workspace already enforces.
export default async function MyAttendancePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const records = await listAttendanceRecordsForProfile(user.id, fromDate, today);

  const recordViews = records.map((r) => ({
    id: r.id,
    attendanceDate: r.attendanceDate,
    dayType: r.dayType,
    actualCheckIn: r.actualCheckIn,
    actualCheckOut: r.actualCheckOut,
    attendanceStatus: r.attendanceStatus,
    isLate: r.isLate,
    isEarlyDeparture: r.isEarlyDeparture,
    explanationNotes: r.explanationNotes,
  }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Attendance</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Check in and out, and see your last two weeks of attendance. These are facts only — any payroll treatment is
          handled separately and never appears here.
        </p>
      </div>

      <MyAttendanceWorkspace today={today} todayRecord={recordViews.find((r) => r.attendanceDate === today) ?? null} records={recordViews} />
    </div>
  );
}
