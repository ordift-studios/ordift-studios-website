import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getPublicProfileForEdit } from "@/lib/team/adminTeamData";
import PortraitEditor from "./PortraitEditor";
import PublicProfileForm from "./PublicProfileForm";

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

        <PublicProfileForm profileId={id} details={data.details} />

        <Link href="/admin/team" className="font-sans text-body-small text-ordift-ink-muted underline underline-offset-4">
          ← Back to Team
        </Link>
      </div>
    </div>
  );
}
