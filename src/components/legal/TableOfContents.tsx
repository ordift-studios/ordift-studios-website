import type { LegalSection } from "@/lib/legal/types";

function TocLinks({ sections }: { sections: LegalSection[] }) {
  return (
    <ol className="space-y-1">
      {sections
        .filter((s) => s.level === 1)
        .map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block py-1 font-sans text-caption text-ordift-ink-muted hover:text-ordift-gold-pressed transition-colors"
            >
              <span className="text-ordift-ink-muted/60 mr-1.5">{s.number}.</span>
              {s.heading}
            </a>
          </li>
        ))}
    </ol>
  );
}

// Zero-JS by design: `sticky` is pure CSS, and the mobile variant is a
// native <details>/<summary> disclosure — both work without
// hydration, which keeps this fast and fully usable with JS disabled.
export default function TableOfContents({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {/* Desktop: sticky sidebar */}
      <nav
        aria-label="Table of contents"
        className="hidden lg:block sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-4"
      >
        <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-ink-muted mb-3">
          On this page
        </p>
        <TocLinks sections={sections} />
      </nav>

      {/* Mobile/tablet: expandable disclosure */}
      <details className="lg:hidden mb-8 rounded-xl border border-black/10 bg-ordift-offwhite open:pb-2">
        <summary className="cursor-pointer select-none px-4 py-3 font-sans font-semibold text-body-small text-ordift-ink">
          Table of contents
        </summary>
        <nav aria-label="Table of contents" className="px-4 pt-1">
          <TocLinks sections={sections} />
        </nav>
      </details>
    </>
  );
}
