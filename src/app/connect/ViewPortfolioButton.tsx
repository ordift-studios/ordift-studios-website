"use client";

import { usePortfolio } from "./PortfolioProvider";

const PRIMARY_BUTTON = "flex min-h-14 w-full items-center justify-between rounded-lg border border-ordift-gold bg-ordift-gold px-5 font-sans text-base font-semibold text-ordift-navy-950 transition-colors hover:border-ordift-gold-hover hover:bg-ordift-gold-hover";

// "View Portfolio": shows the slideshow below the main options and starts it. The button stays where it is; tapping it again brings the slideshow back into view and restarts it.
export default function ViewPortfolioButton() {
  const { open, revealed } = usePortfolio();
  return (
    <button type="button" className={PRIMARY_BUTTON} aria-controls="portfolio" aria-expanded={revealed} onClick={open}>
      View Portfolio
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[1.125rem] w-[1.125rem] flex-none"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
    </button>
  );
}
