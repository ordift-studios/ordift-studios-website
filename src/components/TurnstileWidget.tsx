"use client";

import Script from "next/script";

// Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set — see
// src/lib/turnstile.ts for the matching server-side gate. Cloudflare's
// script auto-discovers every `.cf-turnstile` div on the page and injects
// a hidden `cf-turnstile-response` input into its containing <form>, so
// no extra form-field wiring is needed here.
export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
    </>
  );
}
