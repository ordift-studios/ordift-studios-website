"use client";

import Script from "next/script";
import { useEffect, useId, useState } from "react";

declare global {
  interface Window {
    [key: string]: unknown;
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
};

// Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set — see
// src/lib/turnstile.ts for the matching server-side gate.
export default function TurnstileWidget({ onVerify, onExpire }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const rawId = useId();
  const suffix = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const [erroredToLoad, setErroredToLoad] = useState(false);

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
