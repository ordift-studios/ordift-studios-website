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
    window[verifyName] = (token: string) => onVerify?.(token);
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
        <p className="mt-2 font-sans text-caption text-red-700" role="alert">
          Verification failed to load. Please refresh the page and try again.
        </p>
      )}
    </>
  );
}
