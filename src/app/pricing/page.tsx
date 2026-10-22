import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import PricingEstimatorPanel, { PRICING_FAMILIES, normalizePricingFamily } from "./PricingEstimatorPanel";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Pricing — Ordift Studios";
const DESCRIPTION = "Build your session and see an estimate for Ordift Studios' Personal Portrait, Corporate & Headshots, Weddings & Events, Commercial & Advertising, Graphic Design, Content Creation, Branding & Creative Strategy, or Production Services work, based on where your project takes place.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/pricing`, type: "website" },
};

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family: familyParam } = await searchParams;
  const family = normalizePricingFamily(familyParam);

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">Pricing</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop">Build your session.</h1>
          <p className="font-sans text-body text-white/80 mt-4">
            Pricing is based on where your shoot takes place — not where you live.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-8 pt-10">
        <div className="max-w-xl mx-auto flex flex-wrap justify-center gap-2">
          {PRICING_FAMILIES.map((f) => (
            <Link
              key={f.key}
              href={`/pricing?family=${f.key}`}
              className={`rounded-full border px-5 py-2 font-sans text-body-small ${family === f.key ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-xl mx-auto">
          <PricingEstimatorPanel family={family} />
        </div>
      </section>

      <Footer />
    </main>
  );
}
