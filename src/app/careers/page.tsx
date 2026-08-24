import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import CareersApplicationForm from "./CareersApplicationForm";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Join Our Team — Ordift Studios";
const DESCRIPTION =
  "Ordift Studios works across photography, film, design, branding, content, talent and production. If you're a creative or operational professional, we'd like to hear from you.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/careers` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/careers`, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Recruitment foundation (2026-08-24) — /careers is reached from the
// Team page's "Join Our Team ->" CTA. Submissions go to
// recruitment_applications (private, Admin-only review at
// /admin/recruitment) — never Staff/Admin accounts or public Meet the
// Team profiles, see the migration's own header comment.
export default function CareersPage() {
  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 pt-16 sm:pt-20 pb-14 sm:pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
            Join Our Team
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-white mb-6">
            Build with us.
          </h1>
          <p className="font-sans text-body text-white/80">
            Ordift Studios works across photography, film / videography, editing and post-production, design,
            branding, content, talent, production and creative direction — as one connected studio, not separate
            freelancers passing a project between them. If you&apos;re a creative or operational professional and
            think there&apos;s a fit, we&apos;d like to hear from you.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <CareersApplicationForm />
        </div>
      </section>

      <Footer />
    </main>
  );
}
