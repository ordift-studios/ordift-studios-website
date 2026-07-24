import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import BookingForm from "./BookingForm";
import { contentRepository } from "@/lib/content";
import { whatsAppLink, formattedWhatsAppNumber } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Book a Service — Ordift Studios",
  description:
    "Tell us what you're building. Submit an enquiry for photography, videography, design, branding, content, production, or a general or partnership enquiry.",
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ service }, siteSettings] = await Promise.all([
    searchParams,
    contentRepository.getSiteSettings(),
  ]);

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Book a Service
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl">
            Tell us what you&apos;re building.
          </h1>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <BookingForm initialService={service} />
      </section>

      <section className="bg-ordift-offwhite px-4 sm:px-8 py-10 text-center">
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Prefer to reach us directly?{" "}
          <a
            href={`mailto:${siteSettings.contactEmail}`}
            className="text-ordift-gold-pressed underline underline-offset-4"
          >
            {siteSettings.contactEmail}
          </a>{" "}
          or{" "}
          <a
            href={whatsAppLink(siteSettings.whatsappNumber)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ordift-gold-pressed underline underline-offset-4"
          >
            WhatsApp {formattedWhatsAppNumber(siteSettings.whatsappNumber)}
          </a>
        </p>
      </section>

      <Footer />
    </main>
  );
}
