import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { contentRepository } from "@/lib/content";

// Our Process — moved here from the homepage (2026-10-16). The five steps and their descriptions are the same Sanity fields
// (home.process) the homepage rendered, unchanged; nothing is invented or reworded.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Our Process — Ordift Studios";
const DESCRIPTION = "From discovery to delivery — how Ordift Studios takes a project from the first brief to final assets.";
const CANONICAL = `${SITE_URL}/process`;
const IMAGES = [`${SITE_URL}/opengraph-image`];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL, type: "website", images: IMAGES },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: IMAGES },
};

export default async function ProcessPage() {
  const home = await contentRepository.getHomePage();

  return (
    <main>
      <NavBar />

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            Our Process
          </p>
          <h1 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            From discovery to delivery
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-4">
            {home.process.map((p, i) => (
              <div key={p.step}>
                <p className="font-sans text-caption text-ordift-gold-pressed mb-2">{String(i + 1).padStart(2, "0")}</p>
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-2">{p.step}</p>
                <p className="font-sans text-body-small text-ordift-ink-muted">{p.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
