import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listAttendanceRecordsForDateAcrossStaff, listUnexplainedAbsencesAcrossStaff } from "@/lib/organization/attendance";
import { listActiveStaffRoster } from "@/lib/organization/hrDashboard";
import { AttendanceWorkspace } from "./AttendanceWorkspace";

export const metadata: Metadata = {
  title: "Attendance — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 3 (2026-09-14) —
// the Attendance workspace. Attendance FACTS (late, early departure,
// rest-day worked) and payroll TREATMENT are deliberately never
// combined anywhere in this page or its actions — see
// AttendanceWorkspace.tsx's AttendanceRow.
export default async function AttendanceWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const today = new Date().toISOString().slice(0, 10);
  const [todayRecords, unexplainedAbsences, staffRoster] = await Promise.all([
    listAttendanceRecordsForDateAcrossStaff(today),
    listUnexplainedAbsencesAcrossStaff(),
    listActiveStaffRoster(),
  ]);

  const staffOptions = staffRoster.map((s) => ({ id: s.profileId, name: s.fullName ?? "(no name on record)" }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People · Time &amp; Leave</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Attendance</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          OS-HR-GH-002&rsquo;s attendance engine — review unexplained absences, see today&rsquo;s roster, and record check-ins/outs.
          Attendance facts are shown separately from any payroll treatment, which is never automatic here.
        </p>
      </div>

      <AttendanceWorkspace todayRecords={todayRecords} unexplainedAbsences={unexplainedAbsences} staffOptions={staffOptions} today={today} />
    </div>
  );
}
