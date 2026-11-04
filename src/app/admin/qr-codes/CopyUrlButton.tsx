"use client";

import { useEffect, useRef, useState } from "react";

// "Copy URL": puts the fixed address on the clipboard and says so. Uses the clipboard API where the browser allows it and falls back to selecting a hidden field, so it also works on
// older browsers and over plain HTTP in development. If neither works, it says so and the address is shown on the page to copy by hand.
export default function CopyUrlButton({ url, className }: { url: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); ok = true; }
    } catch { ok = false; }
    if (!ok) {
      try {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed"; field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        ok = document.execCommand("copy");
        document.body.removeChild(field);
      } catch { ok = false; }
    }
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3000);
  }

  return (
    <>
      <button type="button" onClick={copy} className={className}>
        {state === "copied" ? "Copied" : "Copy URL"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "The address was copied to the clipboard." : state === "failed" ? "The address could not be copied. Select it on the page and copy it by hand." : ""}
      </span>
      {state === "failed" && <span className="font-sans text-caption text-red-800">Could not copy. Select the address above and copy it by hand.</span>}
    </>
  );
}
