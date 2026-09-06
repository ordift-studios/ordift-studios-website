import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { listActivePricingMarkets, getActivePersonalSessionRates, listAllSubjectCategories, getActiveAdditionalRetouchRate, type PersonalSessionRate } from "@/lib/pricing/personalSessionPricing";
import {
  getActiveCorporateHeadshotRates,
  getActiveCorporateTeamTierRates,
  getActiveCorporateMinimumBooking,
  getActiveCorporateRetouchRate,
  getActiveCorporatePriorityDeliveryPercentage,
  type CorporateHeadshotRate,
  type CorporateTeamTierRate,
} from "@/lib/pricing/corporateHeadshotPricing";
import PersonalSessionEstimator from "./PersonalSessionEstimator";
import CorporateHeadshotEstimator from "./CorporateHeadshotEstimator";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Pricing — Ordift Studios";
const DESCRIPTION = "Build your session and see an estimate for Ordift Studios' Personal Portrait or Corporate & Headshots photography, based on where your shoot takes place.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/pricing`, type: "website" },
};

const FAMILIES = [
  { key: "personal", label: "Personal Portrait" },
  { key: "corporate", label: "Corporate & Headshots" },
] as const;

// Ordift Pricing Engine (2026-09-06) — public entry point. Server-
// rendered on every request (no ISR/static caching — pricing should
// never be served stale from a build-time snapshot). All markets/
// rates/category data is fetched server-side with the admin/service-
// role client (see personalSessionPricing.ts's own doc comment on why
// that's the correct, established pattern for public reference data)
// and handed to the relevant client estimator as plain props — the
// visitor's browser never queries Supabase directly. Family selection
// (?family=personal|corporate) is a plain Link-based query param, same
// pattern as /admin/payables?status= — no client JS needed for the
// switch itself.
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family: familyParam } = await searchParams;
  const family = familyParam === "corporate" ? "corporate" : "personal";

  const markets = await listActivePricingMarkets();

  const personalData =
    family === "personal"
      ? await (async () => {
          const [ratesByMarketEntries, subjectCategories, retouchRateEntries] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActivePersonalSessionRates(m.slug)] as const)),
            listAllSubjectCategories(),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveAdditionalRetouchRate(m.slug)] as const)),
          ]);
          return {
            ratesByMarket: Object.fromEntries(ratesByMarketEntries) as Record<string, PersonalSessionRate[]>,
            subjectCategories,
            retouchRateByMarket: Object.fromEntries(retouchRateEntries) as Record<string, number | null>,
          };
        })()
      : null;

  const corporateData =
    family === "corporate"
      ? await (async () => {
          const [headshotEntries, teamTierEntries, minimumEntries, retouchEntries, priorityDeliveryPercentage] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateHeadshotRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateTeamTierRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateMinimumBooking(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateRetouchRate(m.slug)] as const)),
            getActiveCorporatePriorityDeliveryPercentage(),
          ]);
          return {
            headshotRatesByMarket: Object.fromEntries(headshotEntries) as Record<string, CorporateHeadshotRate[]>,
            teamTierRatesByMarket: Object.fromEntries(teamTierEntries) as Record<string, CorporateTeamTierRate[]>,
            minimumBookingByMarket: Object.fromEntries(minimumEntries) as Record<string, number | null>,
            retouchRateByMarket: Object.fromEntries(retouchEntries) as Record<string, number | null>,
            priorityDeliveryPercentage,
          };
        })()
      : null;

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
          {FAMILIES.map((f) => (
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
          {markets.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
              <p className="font-sans text-body text-ordift-ink">Pricing isn&rsquo;t published for any market yet — get in touch directly and we&rsquo;ll put together a proposal.</p>
            </div>
          ) : family === "personal" && personalData ? (
            <PersonalSessionEstimator markets={markets} ratesByMarket={personalData.ratesByMarket} subjectCategories={personalData.subjectCategories} retouchRateByMarket={personalData.retouchRateByMarket} />
          ) : corporateData ? (
            <CorporateHeadshotEstimator
              markets={markets}
              headshotRatesByMarket={corporateData.headshotRatesByMarket}
              teamTierRatesByMarket={corporateData.teamTierRatesByMarket}
              minimumBookingByMarket={corporateData.minimumBookingByMarket}
              retouchRateByMarket={corporateData.retouchRateByMarket}
              priorityDeliveryPercentage={corporateData.priorityDeliveryPercentage}
            />
          ) : null}
          <p className="font-sans text-caption text-ordift-ink-muted mt-6 text-center">
            Weddings and commercial/advertising work are proposal-based — <a href="/book?service=general" className="underline">start an enquiry</a> and we&rsquo;ll put together the right quote for your project.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
