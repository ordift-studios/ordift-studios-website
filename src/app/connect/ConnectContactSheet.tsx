"use client";

import { useEffect, useRef } from "react";
import { CALL_OPTIONS, EMAIL, WHATSAPP, mailtoHref, telHref, whatsappHref } from "./connectConfig";

const MAIN_BUTTON = "flex min-h-14 w-full items-center justify-between rounded-lg border border-white/25 px-5 font-sans text-base font-semibold text-white transition-colors hover:border-ordift-gold hover:bg-ordift-gold/10";
const OPTION = "mt-2 flex min-h-14 items-center gap-3.5 rounded-lg border border-ordift-ink/15 bg-white px-4 font-sans text-[0.9375rem] font-medium text-ordift-ink no-underline";
// Keeps the page behind the sheet from scrolling while it is open.
const lockScroll = (on: boolean) => { document.documentElement.style.overflow = on ? "hidden" : ""; };
const ICON = "h-5 w-5 flex-none text-ordift-gold-pressed";

// "Contact Us": a button that opens a bottom sheet with the contact options. It dismisses with the close button, a tap outside it, or the Esc key (native dialog behaviour).
// WhatsApp, each telephone number and email are ordinary links; the visitor chooses Qatar or Ghana explicitly, nothing is selected for them.
export default function ConnectContactSheet() {
  const ref = useRef<HTMLDialogElement>(null);

  // Release the scroll lock whenever the sheet closes (button, backdrop tap or Esc).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const unlock = () => lockScroll(false);
    dlg.addEventListener("close", unlock);
    return () => { dlg.removeEventListener("close", unlock); unlock(); };
  }, []);

  return (
    <>
      <button type="button" className={MAIN_BUTTON} aria-haspopup="dialog" onClick={() => { lockScroll(true); ref.current?.showModal(); }}>
        Contact Us
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[1.125rem] w-[1.125rem]"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>

      <dialog
        ref={ref}
        aria-labelledby="connect-contact-title"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-0 mx-auto mt-auto max-h-[92svh] w-full max-w-[30rem] overflow-y-auto border-0 bg-transparent p-0 text-ordift-ink backdrop:bg-ordift-navy-950/75"
      >
        <div className="rounded-t-2xl bg-ordift-offwhite px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="connect-contact-title" className="font-serif text-xl font-semibold">Contact Us</h2>
            <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="-mr-3 -mt-2 -mb-2 px-3 py-2 text-2xl leading-none text-ordift-ink">×</button>
          </div>

          <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className={OPTION}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={ICON}><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12Z" /></svg>
            <span>WhatsApp<small className="mt-0.5 block text-xs font-normal text-ordift-ink-muted">{WHATSAPP.display}</small></span>
          </a>

          <p className="mb-1 mt-4 font-sans text-xs text-ordift-ink-muted">Call: choose a market</p>
          {CALL_OPTIONS.map((c) => (
            <a key={c.market} href={telHref(c.tel)} className={OPTION}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={ICON}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" /></svg>
              <span>Call {c.market}<small className="mt-0.5 block text-xs font-normal text-ordift-ink-muted">{c.display}</small></span>
            </a>
          ))}

          <a href={mailtoHref()} className={`${OPTION} mt-4`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={ICON}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            <span>Email<small className="mt-0.5 block text-xs font-normal text-ordift-ink-muted">{EMAIL.address}</small></span>
          </a>
        </div>
      </dialog>
    </>
  );
}
