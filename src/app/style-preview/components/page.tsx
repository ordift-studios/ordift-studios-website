import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import DepartmentCard from "@/components/DepartmentCard";
import JournalCard from "@/components/JournalCard";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Component Showcase — Ordift Studios (internal)",
  robots: { index: false, follow: false },
};

const departments = [
  {
    name: "Photography",
    description: "Commercial, portrait, editorial and event photography.",
    href: "/services/photography",
  },
  {
    name: "Videography",
    description: "Brand films, event coverage and short-form content.",
    href: "/services/videography",
  },
  {
    name: "Graphic Design",
    description: "Identity systems, print and digital design.",
    href: "/services/graphic-design",
  },
  {
    name: "Branding & Strategy",
    description: "Positioning, creative direction, campaign development.",
    href: "/services/branding",
  },
];

const journalPosts = [
  {
    title: "How to Prepare for a Professional Photoshoot",
    category: "Photography Tips",
    date: "Sample entry",
    href: "/journal/sample-1",
  },
  {
    title: "Why Every Business Needs Consistent Brand Content",
    category: "Branding",
    date: "Sample entry",
    href: "/journal/sample-2",
  },
  {
    title: "Behind the Scenes of an Ordift Studios Campaign",
    category: "Studio News",
    date: "Sample entry",
    href: "/journal/sample-3",
  },
];

export default function ComponentShowcasePage() {
  return (
    <main>
      <div className="bg-ordift-offwhite border-b border-black/10 px-4 sm:px-8 py-3 text-xs uppercase tracking-[0.2em] text-ordift-gold-pressed">
        Component showcase — internal review, not part of the public site.
        Logo crops are provisional (Plan Part B) — real components,
        placeholder identity assets.
      </div>

      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-14 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Photography · Film · Design · Talent · Strategy
          </p>
          <h1 className="font-serif font-medium text-hero sm:text-hero-tablet lg:text-hero-desktop leading-[var(--text-hero--line-height)] sm:leading-[var(--text-hero-tablet--line-height)] lg:leading-[var(--text-hero-desktop--line-height)] mb-6 max-w-4xl">
            Creating stories people do not just see, but remember.
          </h1>
          <p className="font-sans text-body lg:text-body-desktop text-white/80 max-w-2xl mb-8">
            Ordift Studios is a multidisciplinary creative house where
            photography, film, design, branding, content and talent work
            as one connected system.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/work" variant="primary">
              Explore Our Work
            </Button>
            <Button href="/book" variant="secondary" className="!border-white/30 !text-white">
              Book a Service
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            Departments
          </p>
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            Explore our departments
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {departments.map((d) => (
              <DepartmentCard key={d.name} {...d} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            From the Journal
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {journalPosts.map((post) => (
              <JournalCard key={post.href} {...post} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20 border-t border-black/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8">
            Buttons &amp; logo variants
          </h2>
          <div className="flex flex-wrap gap-4 items-center mb-10">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="dark">Dark</Button>
          </div>
          <div className="flex flex-wrap gap-10 items-end">
            <div className="p-6 bg-white border border-black/10 rounded-xl">
              <Logo variant="full" color="black" height={80} />
            </div>
            <div className="p-6 bg-ordift-navy-950 rounded-xl">
              <Logo variant="full" color="white" height={80} />
            </div>
            <div className="p-6 bg-ordift-navy-950 rounded-xl">
              <Logo variant="full" color="gold" height={80} />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
