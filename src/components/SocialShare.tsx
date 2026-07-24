"use client";

import { useState } from "react";

export default function SocialShare({ url, title }: { url: string; title: string }) {
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">
        Share
      </span>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center min-h-9 px-3 rounded-full border border-black/15 font-sans text-caption text-ordift-ink hover:border-black/30"
      >
        WhatsApp
      </a>
      <a
        href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText)}`}
        className="inline-flex items-center min-h-9 px-3 rounded-full border border-black/15 font-sans text-caption text-ordift-ink hover:border-black/30"
      >
        Email
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center min-h-9 px-3 rounded-full border border-black/15 font-sans text-caption text-ordift-ink hover:border-black/30"
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
