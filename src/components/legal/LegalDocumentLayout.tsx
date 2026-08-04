import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import type { LegalDocument } from "@/lib/legal/types";
import TableOfContents from "./TableOfContents";
import DocumentControlCard from "./DocumentControlCard";
import LegalSection from "./LegalSection";
import DefinitionsList from "./DefinitionsList";
import PublicationDownloads from "./PublicationDownloads";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function LegalDocumentLayout({ document }: { document: LegalDocument }) {
  const { control, sections, definitions } = document;

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow sm:text-eyebrow-desktop text-ordift-gold mb-4">
            {control.publicationSeries}
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-white mb-4">
            {control.documentTitle}
          </h1>
          <p className="font-sans text-body-small text-white/60">
            {control.documentCode} · Version {control.version} · Effective {formatDate(control.effectiveDate)}
          </p>
        </div>
      </section>

      <article className="px-4 sm:px-8 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto mb-10 space-y-6">
          <DocumentControlCard control={control} />
          <PublicationDownloads basePath={`/legal/publications/${document.slug}/${control.documentCode.toLowerCase()}`} />
        </div>

        <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          <div className="lg:block">
            <TableOfContents sections={sections} />
          </div>

          <div className="max-w-3xl space-y-12">
            {sections.map((section) => (
              <div key={section.id}>
                <LegalSection section={section} definitions={definitions} />
                {section.id === "definitions" && definitions.length > 0 && (
                  <div className="mt-4">
                    <DefinitionsList definitions={definitions} />
                  </div>
                )}
              </div>
            ))}

            <p className="font-sans text-caption text-ordift-ink-muted pt-6 border-t border-black/10">
              © {new Date(control.effectiveDate).getFullYear()} Ordift Studios. All rights reserved. Document{" "}
              {control.documentCode}, Version {control.version}.
            </p>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
