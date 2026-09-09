import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import {
  getTalentOverviewCounts,
  listTalentProfiles,
  listTalentOpportunitiesForAdmin,
  listTalentCommercialTermsForAdmin,
  listTalentMediaAssetsForAdmin,
} from "@/lib/talent/talentOverview";
import { listTalentCategories } from "@/lib/talent/talentProfiles";
import { AddCategoryForm } from "./AddCategoryForm";

export const metadata: Metadata = {
  title: "Talent Management — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08). Admin Talent
// Management area. Business-line-inactive foundation — every section
// reads real Production rows; no fixture data anywhere. As of this
// phase every section is genuinely, truthfully empty (no real talent
// has been onboarded into this new architecture) — shown honestly,
// same convention as /admin/legal.

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-serif font-medium text-body text-ordift-ink">{title}</h2>
        {description ? <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="font-sans text-body-small text-ordift-ink-muted italic">{label}</p>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-caption font-semibold bg-black/5 text-ordift-ink">{children}</span>;
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="min-w-full text-left font-sans text-body-small">
        <thead>
          <tr className="border-b border-black/10">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-semibold text-ordift-ink-muted uppercase tracking-wide text-caption">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-black/5">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-ordift-ink align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminTalentManagementPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  // "Add Talent" button visibility (2026-09-09) — reflects REAL
  // authorization through the existing talent.profile.administer
  // capability (Super Admin override, zero grants created here), not
  // just the page's own generic admin-role gate above. This is a
  // read-only check — authorizeWithSuperAdminOverride() never creates
  // an authority_grants row; it only ever reads. The server action
  // behind the button (createTalentProfileAction ->
  // createTalentProfile()) re-checks this independently regardless of
  // whether the button was shown, so hiding it here is UX only, never
  // the real boundary.
  const canAdministerTalent = (await authorizeWithSuperAdminOverride(user.id, TALENT_CAPABILITIES.profileAdminister)).ok;

  const [counts, profiles, opportunities, commercialTerms, mediaAssets, categories] = await Promise.all([
    getTalentOverviewCounts(),
    listTalentProfiles(),
    listTalentOpportunitiesForAdmin(),
    listTalentCommercialTermsForAdmin(),
    listTalentMediaAssetsForAdmin(),
    listTalentCategories(),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Talent Management</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            A business-line-inactive foundation — read-only governance view over talent profiles, representation, commercial terms, opportunities, and media.
            No public listing exists; nothing here has been activated as a live business line.
          </p>
        </div>
        {canAdministerTalent && (
          <Link
            href="/admin/talent/new"
            className="inline-flex items-center min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold hover:bg-ordift-navy-900"
          >
            + Add Talent
          </Link>
        )}
      </div>

      <SectionCard title="Overview">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Talent Profiles</p>
            <p className="font-serif text-body text-ordift-ink">{counts.totalProfiles}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Represented</p>
            <p className="font-serif text-body text-ordift-ink">{counts.representedCount}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Categories</p>
            <p className="font-serif text-body text-ordift-ink">{counts.categoriesCount}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Opportunities Open</p>
            <p className="font-serif text-body text-ordift-ink">{counts.opportunitiesOpen}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Commercial Terms Set</p>
            <p className="font-serif text-body text-ordift-ink">{counts.commercialTermsSetCount}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Media Assets</p>
            <p className="font-serif text-body text-ordift-ink">{counts.mediaAssetsCount}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Talent Profiles" description="Every model_profiles record and its representation status.">
        {profiles.length === 0 ? (
          <EmptyState label="No talent profiles exist yet." />
        ) : (
          <Table
            headers={["Member", "Account Status", "Representation", "Publication", "Categories"]}
            rows={profiles.map((p) => [
              <Link key="n" href={`/admin/talent/${p.profileId}`} className="font-semibold underline">
                {p.memberNumber ?? p.name ?? p.profileId}
              </Link>,
              <Pill key="s">{p.status}</Pill>,
              <Pill key="r">{p.representationStatus}</Pill>,
              <Pill key="p">{p.publicationStatus}</Pill>,
              p.categories.length ? p.categories.join(", ") : "—",
            ])}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Categories"
        description="An extensible, admin-configurable classification list — never hard-coded (Women/Men/Fashion/Commercial/Editorial/Creators/New Faces are examples an admin may add, not a fixed taxonomy)."
      >
        {categories.length === 0 ? (
          <EmptyState label="No talent categories exist yet." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Pill key={c.id}>{c.name}</Pill>
            ))}
          </div>
        )}
        <AddCategoryForm />
      </SectionCard>

      <SectionCard title="Commercial Terms" description="Configurable commission/fee structures. No default rate is ever set — every value reflects a real negotiated term.">
        {commercialTerms.length === 0 ? (
          <EmptyState label="No commercial terms have been set for any talent." />
        ) : (
          <Table
            headers={["Talent", "Commission Type", "Value", "Currency", "Set"]}
            rows={commercialTerms.map((t) => [t.profileId, <Pill key="c">{t.commissionType}</Pill>, t.commissionValue ?? "—", t.currency ?? "—", t.setAt ? new Date(t.setAt).toLocaleDateString() : "—"])}
          />
        )}
      </SectionCard>

      <SectionCard title="Opportunities" description="Internal casting/opportunity records only — never a public listing.">
        {opportunities.length === 0 ? (
          <EmptyState label="No opportunities have been created yet." />
        ) : (
          <Table
            headers={["Title", "Category", "Status", "Created"]}
            rows={opportunities.map((o) => [
              <Link key="t" href={`/admin/talent/opportunities/${o.id}`} className="font-semibold underline">
                {o.title}
              </Link>,
              o.categoryName ?? "—",
              <Pill key="s">{o.status}</Pill>,
              new Date(o.createdAt).toLocaleDateString(),
            ])}
          />
        )}
        <Link href="/admin/talent/opportunities" className="font-sans text-caption text-ordift-ink-muted underline hover:text-ordift-ink">
          Manage Opportunities →
        </Link>
      </SectionCard>

      <SectionCard title="Media" description="Private references into the talent-media Storage bucket. No upload interface exists yet in this phase.">
        {mediaAssets.length === 0 ? (
          <EmptyState label="No media assets have been recorded yet." />
        ) : (
          <Table
            headers={["Talent", "Type", "Path", "Caption", "Uploaded"]}
            rows={mediaAssets.map((m) => [m.profileId, <Pill key="t">{m.mediaType}</Pill>, m.storagePath, m.caption ?? "—", new Date(m.uploadedAt).toLocaleDateString()])}
          />
        )}
      </SectionCard>
    </div>
  );
}
