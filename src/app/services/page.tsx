import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import DepartmentCard from "@/components/DepartmentCard";
import { contentRepository } from "@/lib/content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

const TITLE = "Services — Ordift Studios";
const DESCRIPTION =
  "Photography, videography, graphic design, branding, content, talent management and production — one connected creative system.";
const CANONICAL = `${SITE_URL}/services`;
const IMAGES = [`${SITE_URL}/opengraph-image`];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL, type: "website", images: IMAGES },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: IMAGES },
};

export default async function ServicesPage() {
  const services = await contentRepository.getServices();
  const departments = [...services].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Services
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-3xl mb-6">
            Seven departments. One connected system.
          </h1>
          <p className="font-sans text-body lg:text-body-desktop text-white/80 max-w-2xl">
            Every department at Ordift Studios works from the same
            understanding of what a brand is trying to say — so a project
            doesn&apos;t need five separate vendors to come out consistent.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {departments.map((d) => (
              <DepartmentCard
                key={d.id}
                name={d.name}
                description={d.summaryDescription}
                href={`/services/${d.slug}`}
              />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
