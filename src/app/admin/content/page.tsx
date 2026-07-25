import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Content — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Curated entry points into the existing Sanity Studio (/studio) — not a
// parallel CMS. Studio already has full editing UI, validation, and image
// upload for every type; this hub just saves a staff/admin member from
// hunting through Studio's own list for the thing they came here to edit.
// Deep links use /studio/structure/<typeName> — stable because every
// list item's id in sanity.config.ts's structure() is the schema type
// name itself (both for singletons and S.documentTypeListItem entries).
type ContentLink = { label: string; typeName: string; description?: string };
type ContentSection = { title: string; links: ContentLink[] };

const SECTIONS: ContentSection[] = [
  {
    title: "Site-wide",
    links: [
      { label: "Website Settings", typeName: "siteSettings" },
      { label: "Navigation", typeName: "navigation" },
      { label: "Footer", typeName: "footerSettings" },
      { label: "Announcement Banner", typeName: "announcementBanner" },
    ],
  },
  {
    title: "Pages",
    links: [
      { label: "Homepage", typeName: "homepage" },
      { label: "About Page", typeName: "aboutPage" },
      { label: "Founder", typeName: "founder" },
      { label: "Landing Pages", typeName: "landingPage" },
    ],
  },
  {
    title: "Portfolio",
    links: [
      { label: "Portfolio Projects", typeName: "portfolioProject" },
      { label: "Portfolio Categories", typeName: "portfolioCategory" },
      { label: "Portfolio Collections", typeName: "portfolioCollection" },
    ],
  },
  {
    title: "Workshops",
    links: [
      { label: "Workshops", typeName: "workshop" },
      { label: "Workshop Categories", typeName: "workshopCategory" },
      { label: "Instructors", typeName: "instructor" },
      { label: "Venues", typeName: "venue" },
      { label: "Certificate Templates", typeName: "certificate" },
    ],
  },
  {
    title: "Stories & Departments",
    links: [
      { label: "Stories (Journal)", typeName: "journalPost" },
      { label: "Story Categories", typeName: "journalCategory" },
      { label: "Authors", typeName: "author" },
      { label: "Services / Departments", typeName: "service" },
      { label: "Pricing Packages", typeName: "pricingPackage" },
    ],
  },
  {
    title: "People & Trust",
    links: [
      { label: "Team Members", typeName: "teamMember" },
      { label: "Testimonials", typeName: "testimonial" },
      { label: "Clients", typeName: "client" },
      { label: "Sponsors", typeName: "sponsor" },
      { label: "Partners", typeName: "partner" },
    ],
  },
  {
    title: "Legal",
    links: [{ label: "Legal Pages", typeName: "legalPage" }],
  },
];

export default function AdminContentPage() {
  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Content
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Content is managed in Sanity Studio — these are quick links into it.{" "}
          <a href="/studio" target="_blank" rel="noopener noreferrer" className="underline text-ordift-gold-pressed">
            Open the full Studio →
          </a>
        </p>
      </div>

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">{section.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.links.map((link) => (
                <Link
                  key={link.typeName}
                  href={`/studio/structure/${link.typeName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-black/10 bg-white px-4 py-3 hover:border-black/25 transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">{link.label}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
