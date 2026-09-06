import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { listActivePricingMarkets, getActivePersonalSessionRates, listAllSubjectCategories, type PersonalSessionRate } from "@/lib/pricing/personalSessionPricing";
import PersonalSessionEstimator from "./PersonalSessionEstimator";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Personal Portrait Pricing — Ordift Studios";
const DESCRIPTION = "Build your session and see an estimate for Ordift Studios' personal portrait photography, based on where your shoot takes place.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/pricing`, type: "website" },
};

// Ordift Pricing Engine V1 (2026-09-06) — public entry point for the
// Personal Portrait estimator. Server-rendered on every request (no
// ISR/static caching here — pricing should never be served stale from
// a build-time snapshot). All markets/rates/subject-category data is
// fetched server-side with the admin/service-role client (see
// personalSessionPricing.ts's own doc comment on why that's the
// correct, established pattern for public reference data) and handed
// to the client estimator as plain props — the visitor's browser never
// queries Supabase directly.
export default async function PricingPage() {
  const markets = await listActivePricingMarkets();
  const [ratesByMarketEntries, subjectCategories] = await Promise.all([
    Promise.all(markets.map(async (m) => [m.slug, await getActivePersonalSessionRates(m.slug)] as const)),
    listAllSubjectCategories(),
  ]);
  const ratesByMarket: Record<string, PersonalSessionRate[]> = Object.fromEntries(ratesByMarketEntries);

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">Pricing</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop">Build your session.</h1>
          <p className="font-sans text-body text-white/80 mt-4">
            Personal portrait pricing is based on where your shoot takes place — not where you live. Every session includes Signature Retouched Images and Professionally Edited Images, ready to use.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-xl mx-auto">
          {markets.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
              <p className="font-sans text-body text-ordift-ink">
                Personal portrait pricing isn&rsquo;t published for any market yet — get in touch directly and we&rsquo;ll put together a proposal.
              </p>
            </div>
          ) : (
            <PersonalSessionEstimator markets={markets} ratesByMarket={ratesByMarket} subjectCategories={subjectCategories} />
          )}
          <p className="font-sans text-caption text-ordift-ink-muted mt-6 text-center">
            Weddings, corporate, and commercial work are proposal-based — <a href="/book?service=general" className="underline">start an enquiry</a> and we&rsquo;ll put together the right quote for your project.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
