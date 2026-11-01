import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { listInstructorDirectory, standardsStateLabel } from "@/lib/instructors/directory";

export const metadata: Metadata = { title: "Instructor Directory — Ordift Studios Admin", robots: { index: false, follow: false } };
const pill = "rounded-full px-3 py-1 font-sans text-caption font-medium";

// Read-only directory of independent instructors. Same boundary as the onboarding workspace it links to (Super Admin, or onboarding authority).
export default async function InstructorDirectoryPage() {
  const user = await getCurrentUser();
  if (!user || !(isSuperAdmin(user) || (await canManageOnboarding(user.id)))) redirect("/admin/overview");
  const rows = await listInstructorDirectory();
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Instructor Directory / Onboarding</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">Every independent instructor, with their onboarding stage, framework agreement, standards acknowledgement and assignments. Open an instructor&apos;s onboarding workspace to work through their steps. Related: <Link href="/admin/organization/instructor-standards" className="underline">Instructor Standards</Link> · <Link href="/admin/organization/instructor-assignments" className="underline">Session Schedule / Assignments</Link> (with each assignment&apos;s Rights Matrix).</p>
      </div>
      {rows.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No independent instructors yet.</p> : (
        <div className="overflow-x-auto rounded-xl border border-black/10">
          <table className="w-full text-left font-sans text-body-small">
            <thead className="bg-black/5 text-caption uppercase tracking-wide text-ordift-ink-muted"><tr><th className="px-4 py-3">Instructor</th><th className="px-4 py-3">Onboarding</th><th className="px-4 py-3">Framework agreement</th><th className="px-4 py-3">Standards</th><th className="px-4 py-3">Assignments</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profileId} className="border-t border-black/10 align-top">
                  <td className="px-4 py-3"><div className="font-medium text-ordift-ink">{r.name}</div><div className="text-caption text-ordift-ink-muted">{r.memberNumber ?? "no member number"}</div></td>
                  <td className="px-4 py-3">{r.onboardingId ? <><div className="text-ordift-ink">{r.stage} · {r.onboardingStatus}</div><Link href={`/admin/organization/onboarding/${r.onboardingId}`} className="text-caption underline">Open onboarding workspace</Link></> : <span className="text-ordift-ink-muted">No onboarding record</span>}<div><Link href={`/admin/organization/people/${r.profileId}`} className="text-caption underline">Profile</Link></div></td>
                  <td className="px-4 py-3">{r.agreementReference ? <><div className="text-ordift-ink">{r.agreementReference}</div><span className={`${pill} ${r.agreementExecuted ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{r.agreementExecuted ? "Executed" : r.agreementStatus === "sent" ? "Issued, not fully signed" : r.agreementStatus}</span></> : <span className="text-ordift-ink-muted">None</span>}</td>
                  <td className="px-4 py-3"><span className={`${pill} ${r.standards === "acknowledged" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{standardsStateLabel(r.standards)}</span></td>
                  <td className="px-4 py-3 text-ordift-ink">{r.approvedAssignments} approved · {r.proposedAssignments} proposed</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
