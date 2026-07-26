import type { Metadata } from "next";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Ordift Studios — Coming Soon",
  description: "Ordift Studios — coming soon.",
  robots: { index: false, follow: false },
};

// Temporary production holding page (Milestone 0, Phase 3, refined to
// the minimalist brief). Shown at the public domain in place of the
// full site until launch readiness (Phase 5) is verified and the
// LAUNCH_HOLDING_PAGE gate in proxy.ts is switched off. No site chrome
// (NavBar/Footer) — a standalone full-screen moment, not a page within
// the site.
//
// Deliberately just two elements: the logo and "Coming Soon." No
// headline, no supporting copy, no contact/social links — removed per
// the refined brief, not because the content source lacks them.
export default function ComingSoonPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ordift-navy-950 flex items-center justify-center px-6 py-16">
      {/* Cinematic base gradient — navy-950 to navy-900, no imagery.
          Intensity reduced from the previous pass per the refined brief. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, var(--color-navy-900) 0%, var(--color-navy-950) 65%)",
          opacity: 0.85,
        }}
      />

      <div className="relative flex flex-col items-center text-center">
        {/* Ambient glow behind the logo — shimmers subtly on its own;
            the logo itself never animates or blurs, so it stays sharp
            at every frame, not just at rest. */}
        <div className="relative flex items-center justify-center mb-14 sm:mb-16">
          <div
            className="pointer-events-none absolute -z-10 h-64 w-64 sm:h-80 sm:w-80 rounded-full blur-3xl opacity-[0.20] animate-ordift-shimmer motion-reduce:animate-none"
            style={{ backgroundColor: "var(--color-gold)" }}
            aria-hidden="true"
          />
          <Logo
            variant="full"
            color="white"
            height={98}
            priority
            className="sm:h-[120px] w-auto h-[98px]"
          />
        </div>

        <p className="font-sans font-semibold uppercase tracking-[0.35em] text-xl sm:text-2xl text-ordift-gold">
          Coming Soon
        </p>
      </div>
    </main>
  );
}
