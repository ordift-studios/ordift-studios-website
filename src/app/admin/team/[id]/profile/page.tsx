import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getPublicProfileForEdit } from "@/lib/team/adminTeamData";
import PortraitEditor from "./PortraitEditor";
import { updatePublicProfileAction } from "./actions";

export const metadata: Metadata = {
  title: "Public Profile — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Master public-profile editor for one person (Admin -> Team -> a
// person's row -> "Edit Public Profile"). Distinct from
// /admin/profile/[id] (self-service contact details): this is
// admin-editing-someone-else's public-facing content, and distinct from
// Meet the Team curation (/admin/team) itself — this page owns the
// content, that page owns visibility/order/field-gating. Editing here
// automatically flows through to Meet the Team for anyone already
// showcased, with no re-entry required (see getPublicTeamMembers.ts).
export default async function TeamMemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/admin/team");
  if (!isSuperAdmin(user)) redirect("/admin/team");

  const data = await getPublicProfileForEdit(id);
  if (!data) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          <Link href="/admin/team" className="hover:underline">
            Team
          </Link>{" "}
          / Public Profile
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {data.fullName ?? "Unnamed account"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {[data.jobTitle, data.department].filter(Boolean).join(" · ") || "No job title/department on record"}
        </p>
      </div>

      <div className="space-y-8">
        <div className="bg-white rounded-lg border border-ordift-ink/10 p-6">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-1">Portrait</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-4">
            Used for Meet the Team&apos;s circular portrait. Drag to reposition so the crop doesn&apos;t cut off a face.
          </p>
          <PortraitEditor
            profileId={id}
            initialUrl={data.avatarUrl}
            initialFocalX={data.avatarFocalX}
            initialFocalY={data.avatarFocalY}
          />
        </div>

        <form action={updatePublicProfileAction} className="bg-white rounded-lg border border-ordift-ink/10 p-6 space-y-4">
          <input type="hidden" name="profileId" value={id} />
          <h2 className="font-serif font-medium text-card-title text-ordift-ink">Public Profile</h2>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Only fields with real content, and only where the specific Meet the Team entry allows them (see Admin →
            Team), are ever shown publicly. Nothing here appears on the website until this person is also added to
            Meet the Team.
          </p>

          <label className="block">
            <span className="font-sans text-body-small text-ordift-ink-muted">Public Display Name / Nickname *</span>
            <input
              name="displayName"
              defaultValue={data.details.displayName}
              required
              placeholder="e.g. Sarah, or a public handle — not necessarily the legal name on file"
              className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
            />
          </label>

          <label className="block">
            <span className="font-sans text-body-small text-ordift-ink-muted">Short Public Bio</span>
            <textarea
              name="bio"
              rows={3}
              defaultValue={data.details.bio ?? ""}
              className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
            />
          </label>

          <label className="block">
            <span className="font-sans text-body-small text-ordift-ink-muted">Specialty / Area of Expertise</span>
            <input
              name="specialty"
              defaultValue={data.details.specialty ?? ""}
              className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
            />
          </label>

          <label className="block">
            <span className="font-sans text-body-small text-ordift-ink-muted">Social Handle / Public Profile URL</span>
            <input
              name="socialHandle"
              defaultValue={data.details.socialHandle ?? ""}
              placeholder="@handle or a full URL"
              className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
            />
          </label>

          <label className="block">
            <span className="font-sans text-body-small text-ordift-ink-muted">Favorite Quote</span>
            <textarea
              name="favoriteQuote"
              rows={2}
              defaultValue={data.details.favoriteQuote ?? ""}
              className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
            />
          </label>

          <label className="block">
            <span className="font-sans text-body-small text-ordift-ink-muted">Something You May Not Know About Me</span>
            <textarea
              name="funFact"
              rows={2}
              defaultValue={data.details.funFact ?? ""}
              className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-ordift-navy-950 text-white font-sans text-button font-semibold px-6 py-2.5 hover:bg-ordift-navy-900 transition-colors"
          >
            Save Public Profile
          </button>
        </form>

        <Link href="/admin/team" className="font-sans text-body-small text-ordift-ink-muted underline underline-offset-4">
          ← Back to Team
        </Link>
      </div>
    </div>
  );
}
