import Image from "next/image";
import ConnectContactSheet from "./ConnectContactSheet";
import ConnectGallery from "./ConnectGallery";
import type { ConnectImage } from "./gallery";
import { BRAND_NAME, GALLERY_MIN_IMAGES, PORTFOLIO_FALLBACK_LINK, SOCIAL_LINKS, TAGLINE, WEBSITE_LINK } from "./connectConfig";

const MAIN_BUTTON = "flex min-h-14 w-full items-center justify-between rounded-lg border border-white/25 px-5 font-sans text-base font-semibold text-white transition-colors hover:border-ordift-gold hover:bg-ordift-gold/10";
const PRIMARY_BUTTON = "flex min-h-14 w-full items-center justify-between rounded-lg border border-ordift-gold bg-ordift-gold px-5 font-sans text-base font-semibold text-ordift-navy-950 transition-colors hover:border-ordift-gold-hover hover:bg-ordift-gold-hover";
const ICON = "h-[1.125rem] w-[1.125rem] flex-none";

// The QR landing page: one column, three main options, secondary social links, and (when enough approved photographs exist) the gallery below. No site navigation or footer,
// no introduction, no animation. The approved gold logo carries the ORDIFT STUDIOS name; the heading below is for screen readers.
export default function ConnectView({ images }: { images: ConnectImage[] }) {
  const showGallery = images.length >= GALLERY_MIN_IMAGES;
  return (
    <div className="min-h-svh bg-ordift-navy-950 text-white">
      <style>{"html{scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}"}</style>
      <main className="mx-auto max-w-[30rem] px-5 pb-12 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <header className="pb-8 text-center">
          <h1 className="sr-only">{BRAND_NAME}</h1>
          <Image src="/brand/logo-full-gold.png" alt={BRAND_NAME} width={461} height={348} priority unoptimized className="mx-auto h-auto w-[9.5rem]" />
          <p className="mt-2 font-serif text-[1.0625rem] tracking-[0.01em] text-white/70">{TAGLINE}</p>
        </header>

        <nav aria-label={`Connect with ${BRAND_NAME}`} className="grid gap-3">
          {showGallery ? (
            <a href="#portfolio" className={PRIMARY_BUTTON}>
              View Portfolio
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={ICON}><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </a>
          ) : (
            <a href={PORTFOLIO_FALLBACK_LINK} className={PRIMARY_BUTTON}>
              View Portfolio
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={ICON}><path d="M7 17 17 7M8 7h9v9" /></svg>
            </a>
          )}
          <a href={WEBSITE_LINK} className={MAIN_BUTTON}>
            Visit Website
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={ICON}><path d="M7 17 17 7M8 7h9v9" /></svg>
          </a>
          <ConnectContactSheet />
        </nav>

        {SOCIAL_LINKS.length > 0 && (
          <ul aria-label="Social media" className="mt-7 flex justify-center gap-6">
            {SOCIAL_LINKS.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="px-1 py-2 font-sans text-[0.8125rem] tracking-[0.04em] text-white/60 hover:text-white">{s.label}</a>
              </li>
            ))}
          </ul>
        )}

        {showGallery && (
          <section id="portfolio" aria-labelledby="connect-portfolio-title" className="mt-12 scroll-mt-4">
            <h2 id="connect-portfolio-title" className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Portfolio</h2>
            <ConnectGallery images={images} />
          </section>
        )}
      </main>
    </div>
  );
}
