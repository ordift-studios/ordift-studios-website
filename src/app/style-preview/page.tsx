import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Type System — Ordift Studios (internal)",
  robots: { index: false, follow: false },
};

function Spec({
  label,
  usage,
  font,
  weight,
  sizes,
  children,
}: {
  label: string;
  usage: string;
  font: string;
  weight: string;
  sizes: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-black/10 py-8 sm:py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <span className="text-xs uppercase tracking-[0.2em] text-ordift-gold-pressed">
          {label}
        </span>
        <span className="text-xs text-ordift-ink-muted font-sans">
          {font} {weight} · {sizes}
        </span>
      </div>
      <p className="text-xs text-ordift-ink-muted font-sans mb-4">{usage}</p>
      {children}
    </div>
  );
}

export default function StylePreviewPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-10 sm:px-8 sm:py-16">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 sm:mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-ordift-gold-pressed mb-3">
            Internal review — not part of the public site
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-ordift-ink mb-3">
            Type System — locked 2026-07-23
          </h1>
          <p className="text-ordift-ink-muted text-sm sm:text-base leading-relaxed max-w-2xl">
            Fraunces (display/headings) + Inter (everything else), approved
            after full-page desktop/mobile comparison against Space Grotesk
            and Cormorant Garamond (retired, no longer loaded — see
            TYPOGRAPHY.md for the full spec and decision history). Resize
            this window to see each category scale from mobile → tablet →
            desktop.
          </p>
        </header>

        <Spec
          label="Hero Headline"
          usage="Homepage hero, full-bleed cinematic statements"
          font="Fraunces"
          weight="500"
          sizes="36 / 60 / 72px"
        >
          <p className="font-serif font-medium text-hero sm:text-hero-tablet lg:text-hero-desktop leading-[var(--text-hero--line-height)] sm:leading-[var(--text-hero-tablet--line-height)] lg:leading-[var(--text-hero-desktop--line-height)] text-ordift-ink">
            Creating stories people do not just see, but remember.
          </p>
        </Spec>

        <Spec
          label="Page Title"
          usage="Department pages, About, Journal index — top-of-page H1"
          font="Fraunces"
          weight="500"
          sizes="30 / 48 / 60px"
        >
          <p className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-ordift-ink">
            Photography
          </p>
        </Spec>

        <Spec
          label="Section Heading"
          usage="In-page section titles ('Explore our departments')"
          font="Fraunces"
          weight="500"
          sizes="20 / 24 / 30px"
        >
          <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink">
            Explore our departments
          </p>
        </Spec>

        <Spec
          label="Card Title"
          usage="Department cards, journal cards, portfolio project titles"
          font="Fraunces"
          weight="500"
          sizes="18 / 18 / 20px"
        >
          <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink">
            Behind the Scenes of an Ordift Studios Campaign
          </p>
        </Spec>

        <Spec
          label="Body Text"
          usage="Paragraph copy — About, department descriptions, journal posts"
          font="Inter"
          weight="400"
          sizes="16 / 16 / 18px"
        >
          <p className="font-sans text-body lg:text-body-desktop text-ordift-ink-muted max-w-xl">
            Ordift Studios is a multidisciplinary creative house where
            photography, film, design, branding, content and talent work as
            one connected system.
          </p>
        </Spec>

        <Spec
          label="Small Body Text"
          usage="Secondary copy — card descriptions, form helper text"
          font="Inter"
          weight="400"
          sizes="14px (all breakpoints)"
        >
          <p className="font-sans text-body-small text-ordift-ink-muted max-w-xl">
            Commercial, portrait, editorial and event photography.
          </p>
        </Spec>

        <Spec
          label="Eyebrow / Overline"
          usage="Category labels above headings ('Department', 'Photography Tips')"
          font="Inter"
          weight="600"
          sizes="12 / 12 / 14px, tracked wide, uppercase"
        >
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold-pressed">
            Photography · Film · Design · Talent · Strategy
          </p>
        </Spec>

        <Spec
          label="Navigation"
          usage="Header nav links, footer links"
          font="Inter"
          weight="500"
          sizes="14px (all breakpoints)"
        >
          <div className="flex gap-6 font-sans font-medium text-nav text-ordift-ink">
            <span>About</span>
            <span>Services</span>
            <span>Work</span>
            <span>Talent</span>
            <span>Journal</span>
          </div>
        </Spec>

        <Spec
          label="Button Text"
          usage="Primary/secondary CTAs, form submit buttons"
          font="Inter"
          weight="600"
          sizes="14px (all breakpoints)"
        >
          <div className="flex flex-wrap gap-3">
            <button className="px-6 py-3 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950">
              Book a Service
            </button>
            <button className="px-6 py-3 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink">
              Explore Our Work
            </button>
          </div>
        </Spec>

        <Spec
          label="Captions"
          usage="Image captions, form field notes, footnotes"
          font="Inter"
          weight="400"
          sizes="12px (all breakpoints)"
        >
          <p className="font-sans text-caption text-ordift-ink-muted">
            Sample entry — replace via CMS.
          </p>
        </Spec>

        <Spec
          label="Quotes"
          usage="Pull quotes, editorial statements (Brand Bible callouts)"
          font="Fraunces italic"
          weight="400"
          sizes="20 / 24 / 30px"
        >
          <p className="font-serif italic text-quote sm:text-quote-tablet lg:text-quote-desktop text-ordift-ink">
            Real success takes patience, resilience and consistency.
          </p>
        </Spec>

        <footer className="mt-10 sm:mt-14 text-xs text-ordift-ink-muted max-w-2xl">
          Full spec — exact tokens, accessibility notes, fallback stacks —
          lives in <code>TYPOGRAPHY.md</code> at the project root.
        </footer>
      </div>
    </main>
  );
}
