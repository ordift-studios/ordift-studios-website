import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { contentRepository } from "@/lib/content";
import type { LegalPageSlug } from "@/lib/content/types";

// Single dynamic route replacing 4 near-identical static pages (migrated
// 2026-07-24, Version 1.2.6). Existing URLs unchanged: /legal/privacy,
// /legal/terms, /legal/cookies, /legal/booking. Structure only, per Plan
// Part H — unpublished and noindexed until the real policy is written
// and approved. Production form-sending stays disabled (see
// src/lib/shared/env.ts) until LEGAL_PAGES_APPROVED=true, which should
// only be set once these pages hold real, approved text.

const VALID_SLUGS: LegalPageSlug[] = ["privacy", "terms", "cookies", "booking"];

export async function generateStaticParams() {
  return VALID_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!VALID_SLUGS.includes(slug as LegalPageSlug)) return {};
  const page = await contentRepository.getLegalPage(slug as LegalPageSlug);
  if (!page) return {};
  return {
    title: `${page.title}${page.isApproved ? "" : " (Draft)"} — Ordift Studios`,
    robots: { index: page.isApproved, follow: page.isApproved },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!VALID_SLUGS.includes(slug as LegalPageSlug)) notFound();
  const page = await contentRepository.getLegalPage(slug as LegalPageSlug);
  if (!page) notFound();

  return (
    <main>
      <NavBar />
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16">
        <div className="max-w-3xl mx-auto">
          {!page.isApproved && (
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-4">
              Draft — not yet approved
            </p>
          )}
          <h1 className="font-serif font-medium text-page-title text-white mb-4">
            {page.title}
          </h1>
          {page.lastUpdated && (
            <p className="font-sans text-body-small text-white/50 mb-6">
              Last updated {new Date(page.lastUpdated).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
          <div className="space-y-4">
            {(page.body ?? "").split(/\n{2,}/).map((paragraph, i) => (
              <p key={i} className="font-sans text-body text-white/80">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
