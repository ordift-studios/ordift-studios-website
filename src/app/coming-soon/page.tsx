import type { Metadata } from "next";
import Logo from "@/components/Logo";
import { contentRepository } from "@/lib/content";

export const metadata: Metadata = {
  title: "Ordift Studios — Coming Soon",
  description: "Our next chapter is currently being crafted.",
  robots: { index: false, follow: false },
};

// Temporary production holding page (Milestone 0, Phase 3) — shown at
// the public domain in place of the full site until launch readiness
// (Phase 5) is verified and the LAUNCH_HOLDING_PAGE gate in proxy.ts is
// switched off. No site chrome (NavBar/Footer) deliberately — this is a
// standalone full-screen moment, not a page within the site.
//
// Social links render only if real ones exist in site settings
// (currently empty — Sanity `socialLinks` has never been populated).
// Nothing here is invented; the "where available" instruction is
// satisfied by wiring to the real content source rather than hardcoding
// placeholder handles.
export default async function ComingSoonPage() {
  const settings = await contentRepository.getSiteSettings();

  return (
    <main className="relative min-h-screen overflow-hidden bg-ordift-navy-950 flex items-center justify-center px-6 py-16">
      {/* Cinematic base gradient — navy-950 to navy-900, no imagery */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, var(--color-navy-900) 0%, var(--color-navy-950) 70%)",
        }}
      />

      <div className="relative flex flex-col items-center text-center max-w-xl">
        {/* Soft gold glow behind the logo — the logo itself stays fully sharp */}
        <div className="relative flex items-center justify-center mb-10 sm:mb-12">
          <div
            className="pointer-events-none absolute -z-10 h-56 w-56 sm:h-72 sm:w-72 rounded-full blur-3xl opacity-25"
            style={{ backgroundColor: "var(--color-gold)" }}
            aria-hidden="true"
          />
          <div className="animate-ordift-breathe motion-reduce:animate-none">
            <Logo variant="full" color="white" height={72} priority className="sm:h-[88px] w-auto h-[72px]" />
          </div>
        </div>

        <p className="font-sans font-semibold uppercase tracking-[0.3em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-5">
          Coming Soon
        </p>

        <p className="font-serif font-medium text-page-title sm:text-page-title-tablet text-white leading-snug mb-6">
          Our next chapter is currently being crafted.
        </p>

        <p className="font-sans text-body text-white/70 max-w-md mb-12">
          We look forward to welcoming you soon.
        </p>

        <div className="flex flex-col items-center gap-3">
          {settings.socialLinks.length > 0 && (
            <div className="flex items-center gap-5">
              {settings.socialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-caption uppercase tracking-[0.15em] text-white/60 hover:text-white transition-colors"
                >
                  {link.platform}
                </a>
              ))}
            </div>
          )}
          <a
            href={`mailto:${settings.contactEmail}`}
            className="font-sans text-caption text-white/50 hover:text-white/80 transition-colors"
          >
            {settings.contactEmail}
          </a>
        </div>
      </div>
    </main>
  );
}
