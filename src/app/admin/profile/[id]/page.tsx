import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getProfileCard } from "@/lib/portal/profileCard";
import { listOperationalTitles, listGrades } from "@/lib/portal/adminData";
import { updateOwnContactDetailsAction, updateStaffOperationalDetailsAction, assignStaffNumberAction } from "./actions";

export const metadata: Metadata = {
  title: "Profile — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// V1 scope: self-view only, reached exclusively via the Admin Profile
// Quick Card (src/components/admin/ProfileQuickCard.tsx) trigger on your
// own name. A future "staff directory" milestone can extend this to
// viewing colleagues; until then, requesting anyone else's id redirects
// back to your own profile rather than 404ing or silently leaking data.
export default async function AdminProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/admin");
  if (id !== user.id) redirect(`/admin/profile/${user.id}`);

  const card = await getProfileCard(user);
  const isEditing = edit === "1";
  const canEditOperational = isSuperAdmin(user);

  const [operationalTitles, grades] = canEditOperational
    ? await Promise.all([listOperationalTitles(), listGrades()])
    : [[], []];

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          {isEditing ? "Edit Profile" : "Profile"}
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {card.fullName ?? "Unnamed account"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">{card.roleLabel}</p>
      </div>

      {!isEditing ? (
        <div className="bg-white rounded-lg border border-ordift-ink/10 divide-y divide-ordift-ink/10">
          {(
            [
              ["Email", card.email ?? "—"],
              ["Phone", card.phone ?? "Not set"],
              ["Staff Number", card.staffNumber ?? "Not yet assigned"],
              ["Job Title", card.jobTitle ?? "Not set"],
              ["Department", card.department ?? "Not set"],
              ...(card.canViewGrade
                ? ([["Grade", card.grade ? `${card.grade.name} (${card.grade.code})` : "Not assigned"]] as [string, string][])
                : []),
              [
                "Date Joined",
                new Date(card.dateJoined).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
              ],
              ["Platform Tenure", card.tenure],
              ["Account Status", card.accountStatus],
              ["Last Login", card.lastLoginAt ? new Date(card.lastLoginAt).toLocaleString("en-GB") : "No record"],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-6 py-4">
              <span className="font-sans text-body-small text-ordift-ink-muted">{label}</span>
              <span className="font-sans text-body-small text-ordift-ink font-medium">{value}</span>
            </div>
          ))}

          <div className="px-6 py-4">
            <Link
              href={`/admin/profile/${card.id}?edit=1`}
              className="inline-flex items-center rounded-full bg-ordift-gold text-ordift-navy-950 font-sans text-button font-semibold px-6 py-2.5 hover:bg-ordift-gold-hover transition-colors"
            >
              Edit Profile
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <form action={updateOwnContactDetailsAction} className="bg-white rounded-lg border border-ordift-ink/10 p-6 space-y-4">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink">Contact Details</h2>
            <label className="block">
              <span className="font-sans text-body-small text-ordift-ink-muted">Full Name</span>
              <input
                name="fullName"
                defaultValue={card.fullName ?? ""}
                required
                className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
              />
            </label>
            <label className="block">
              <span className="font-sans text-body-small text-ordift-ink-muted">Phone</span>
              <input
                name="phone"
                type="tel"
                defaultValue={card.phone ?? ""}
                className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-ordift-navy-950 text-white font-sans text-button font-semibold px-6 py-2.5 hover:bg-ordift-navy-900 transition-colors"
            >
              Save Contact Details
            </button>
          </form>

          {canEditOperational && (
            <form action={updateStaffOperationalDetailsAction} className="bg-white rounded-lg border border-ordift-ink/10 p-6 space-y-4">
              <input type="hidden" name="userId" value={card.id} />
              <h2 className="font-serif font-medium text-card-title text-ordift-ink">Operational Details</h2>
              <p className="font-sans text-eyebrow text-ordift-ink-muted uppercase tracking-[0.1em]">
                Super Admin only — admin-managed, not self-service
              </p>

              <label className="block">
                <span className="font-sans text-body-small text-ordift-ink-muted">Job Title</span>
                <select
                  name="operationalTitleId"
                  defaultValue={card.operationalTitleId ?? ""}
                  className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small bg-white"
                >
                  <option value="">Not set</option>
                  {operationalTitles.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-sans text-body-small text-ordift-ink-muted">Department</span>
                <input
                  name="department"
                  defaultValue={card.department ?? ""}
                  className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
                />
              </label>

              <label className="block">
                <span className="font-sans text-body-small text-ordift-ink-muted">Grade (internal only — never shown publicly)</span>
                <select
                  name="gradeId"
                  defaultValue={card.gradeId ?? ""}
                  className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small bg-white"
                >
                  <option value="">Not assigned</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.grade_code})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="rounded-full bg-ordift-navy-950 text-white font-sans text-button font-semibold px-6 py-2.5 hover:bg-ordift-navy-900 transition-colors"
              >
                Save Operational Details
              </button>
            </form>
          )}

          {canEditOperational && !card.staffNumber && (
            <form action={assignStaffNumberAction} className="bg-white rounded-lg border border-ordift-ink/10 p-6 space-y-3">
              <input type="hidden" name="userId" value={card.id} />
              <h2 className="font-serif font-medium text-card-title text-ordift-ink">Staff Number</h2>
              <p className="font-sans text-body-small text-ordift-ink-muted">
                No staff number assigned yet. Generates the next STAFF-{new Date().getFullYear()}-NNNNNN identifier.
              </p>
              <button
                type="submit"
                className="rounded-full border border-ordift-ink/30 text-ordift-ink font-sans text-button font-semibold px-6 py-2.5 hover:border-ordift-ink/60 transition-colors"
              >
                Assign Staff Number
              </button>
            </form>
          )}

          <Link href={`/admin/profile/${card.id}`} className="font-sans text-body-small text-ordift-ink-muted underline underline-offset-4">
            Cancel and return to profile
          </Link>
        </div>
      )}
    </div>
  );
}
