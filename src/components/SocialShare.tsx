"use client";

import { useState } from "react";

// `dark` (2026-08-23, Videography) — light-on-dark styling for the
// cinematic Videography project page, which sits on a dark navy
// background unlike every other existing caller (Photography, Graphic
// Design, the generic shell), all of which omit this prop and keep the
// exact original light-page styling.
export default function SocialShare({ url, title, dark = false }: { url: string; title: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) —
      // fail silently rather than show a broken "copied" state.
    }
  }

  const shareText = `${title} — ${url}`;
  const linkClass = dark
    ? "inline-flex items-center min-h-9 px-3 rounded-full border border-white/20 font-sans text-caption text-white/80 hover:border-white/40"
    : "inline-flex items-center min-h-9 px-3 rounded-full border border-black/15 font-sans text-caption text-ordift-ink hover:border-black/30";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`font-sans text-caption uppercase tracking-[0.1em] ${dark ? "text-white/50" : "text-ordift-ink-muted"}`}
      >
        Share
      </span>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        WhatsApp
      </a>
      <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText)}`} className={linkClass}>
        Email
      </a>
      <button type="button" onClick={handleCopy} className={linkClass}>
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
