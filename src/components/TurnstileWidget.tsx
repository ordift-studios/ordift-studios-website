"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    [key: string]: unknown;
    turnstile?: {
      reset: (idOrContainer?: string | HTMLElement) => void;
    };
  }
}

type Props = {
  // Optional — /portal/signup and /portal/login render this with no
  // props at all and rely purely on Cloudflare's implicit behavior
  // (auto-injecting a hidden `cf-turnstile-response` field into the
  // containing <form>, read via formData in their server actions).
  // Passing onVerify doesn't disable that — both fire. Forms that
  // submit via fetch() with a JSON body instead of a native form
  // POST (Contact Enquiry, Workshop Registration) need the token
  // handed to them directly, since there's no FormData to read it
  // from.
  onVerify?: (token: string) => void;
  onExpire?: () => void;
  // Change this (e.g. pass the useActionState result object, which
  // gets a fresh identity on every dispatch) after a failed form
  // submission to force a new challenge (2026-08-07). A Turnstile
  // token is single-use: Cloudflare returns the identical
  // "timeout-or-duplicate" error for both an expired token AND one
  // that's already been redeemed (see turnstile.ts's doc comment).
  // Without this, the widget keeps showing its last "Success!" state
  // and a retried submission silently carries the already-spent
  // token, surfacing as an unhelpful "Verification failed" even when
  // the real problem was something else entirely (e.g. a wrong
  // password) on the first attempt. Ignored on initial mount.
  resetSignal?: unknown;
};

// Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set — see
// src/lib/turnstile.ts for the matching server-side gate.
export default function TurnstileWidget({ onVerify, onExpire, resetSignal }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const rawId = useId();
  const suffix = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const containerId = `turnstile-${suffix}`;
  const [erroredToLoad, setErroredToLoad] = useState(false);
  const hasMounted = useRef(false);

  const verifyName = `__turnstileVerify_${suffix}`;
  const expireName = `__turnstileExpire_${suffix}`;
  const errorName = `__turnstileError_${suffix}`;

  useEffect(() => {
    // K.2C (2026-09-06) — a genuine success must clear any stale error
    // state. Cloudflare's own error family for this widget (600*,
    // "generic challenge failure — bot behavior detected") is
    // documented as retryable: Turnstile can fail once and still
    // succeed on a subsequent attempt without the page ever reloading.
    // Before this, a token arriving after an earlier error-callback
    // still left the red "Verification failed" text visible under a
    // now-green, successful widget.
    window[verifyName] = (token: string) => {
      setErroredToLoad(false);
      onVerify?.(token);
    };
    window[expireName] = () => onExpire?.();
    window[errorName] = () => setErroredToLoad(true);
    return () => {
      delete window[verifyName];
      delete window[expireName];
      delete window[errorName];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyName, expireName, errorName]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    window.turnstile?.reset(containerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        onError={() => setErroredToLoad(true)}
      />
      <div
        id={containerId}
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-theme="light"
        data-callback={verifyName}
        data-expired-callback={expireName}
        data-error-callback={errorName}
      />
      {erroredToLoad && (
        <div className="mt-2" role="alert">
          <p className="font-sans text-caption text-red-700">
            Verification didn&rsquo;t complete. This is usually temporary.
          </p>
          <button
            type="button"
            onClick={() => {
              // K.2C (2026-09-06) — same window.turnstile.reset() call the
              // resetSignal effect above already uses, just user-triggered
              // instead of state-triggered. Requests a fresh, genuine
              // challenge in place — never skips or weakens verification —
              // so a documented-retryable Cloudflare-side failure (see the
              // verifyName comment) doesn't strand a real visitor behind a
              // full manual page reload.
              window.turnstile?.reset(containerId);
              setErroredToLoad(false);
            }}
            className="mt-1 font-sans text-caption font-medium text-ordift-gold-pressed underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}
    </>
  );
}
