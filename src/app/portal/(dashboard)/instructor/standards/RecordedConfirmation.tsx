"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Shown only when the acknowledgement is already saved (the page is rendered from the database). On arrival it scrolls to the top and takes focus so the confirmation cannot be missed, including by
// a screen reader, after the instructor submitted from the bottom of a long page.
export function RecordedConfirmation({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "auto" });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section ref={ref} tabIndex={-1} role="status" className="rounded-xl border border-green-300 bg-green-50 p-5 space-y-2 outline-none scroll-mt-24" data-testid="standards-acknowledged">
      {children}
    </section>
  );
}
