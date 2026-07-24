import Link from "next/link";
import Logo from "./Logo";
import { contentRepository } from "@/lib/content";

// Newsletter signup intentionally omitted here — it's a Tier 1 form
// (Plan Part G) and belongs with the rest of the form-building milestone,
// not faked as a static input with nowhere to send data.

const LEGAL_LINKS = [
  { label: "Privacy Notice", href: "/legal/privacy" },
  { label: "Cookie Notice", href: "/legal/cookies" },
  { label: "Website Terms", href: "/legal/terms" },
  { label: "Booking Terms", href: "/legal/booking" },
];

// Server Component (Version 1.2.6) — fetches Footer content directly;
// every existing `<Footer />` call site is unchanged.
export default async function Footer() {
  const footer = await contentRepository.getFooterSettings();

  return (
    <footer className="bg-ordift-navy-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-14 sm:py-20">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-10 mb-12 sm:mb-16">
          <div className="col-span-2">
            <Logo variant="full" color="white" height={64} className="mb-4" />
            <p className="font-sans text-body-small text-white/70 max-w-xs">
              {footer.tagline}
            </p>
          </div>

          {footer.columns.map((col) => (
            <div key={col.heading}>
              <p className="font-sans font-semibold text-nav text-white mb-4">
                {col.heading}
              </p>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="font-sans text-body-small text-white/70 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-white/10">
          <p className="font-sans text-caption text-white/50">
            © Ordift Studios. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-sans text-caption text-white/50 hover:text-white/80 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
