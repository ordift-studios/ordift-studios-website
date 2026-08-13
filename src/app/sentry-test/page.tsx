"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";

// Temporary diagnostic route for verifying Production Sentry delivery
// (Version 1.0.5 Workstream C follow-up). Deliberately isolated: no
// Supabase, Paystack, forms, auth, storage, or business-workflow
// imports. Remove this route entirely once verification is complete.
export default function SentryTestPage() {
  const [sent, setSent] = useState(false);

  function handleSendTestError() {
    Sentry.captureException(new Error("Ordift Production Sentry Verification Test"));
    setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-24">
      <div className="max-w-md w-full text-center">
        <h1 className="font-sans font-semibold text-2xl mb-4">Sentry Production Test</h1>
        <p className="font-sans text-sm text-black/60 mb-8">
          This is a temporary diagnostic page used to verify that Sentry is
          correctly receiving events in this environment. It will be removed
          once verification is complete.
        </p>
        <button
          type="button"
          onClick={handleSendTestError}
          className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-sm bg-black text-white hover:bg-black/80 transition-colors"
        >
          Send Sentry Test Error
        </button>
        {sent && (
          <p className="font-sans text-sm mt-6" role="status">
            Test event sent. Check Sentry.
          </p>
        )}
      </div>
    </main>
  );
}
