"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";

// Temporary diagnostic route for verifying Production Sentry delivery
// (Version 1.0.5 Workstream C follow-up). Deliberately isolated: no
// Supabase, Paystack, forms, auth, storage, or business-workflow
// imports. Remove this route entirely once verification is complete.
export default function SentryTestPage() {
  const [status, setStatus] = useState<"idle" | "sent" | "unavailable">("idle");

  function handleSendTestError() {
    // Sentry.init() no-ops without a valid DSN — captureException() would
    // still return without throwing, so a message here can't be trusted
    // unless a client actually exists. (Found live 2026-08-12: this page
    // reported "sent" for several hours while Production's DSN held a
    // masked placeholder value, not a real one, and no event ever arrived.)
    if (!Sentry.getClient()) {
      setStatus("unavailable");
      return;
    }
    Sentry.captureException(new Error("Ordift Production Sentry Verification Test"));
    setStatus("sent");
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
        {status === "sent" && (
          <p className="font-sans text-sm mt-6" role="status">
            Test event sent. Check Sentry.
          </p>
        )}
        {status === "unavailable" && (
          <p className="font-sans text-sm mt-6 text-red-600" role="status">
            Sentry client is not initialized in this environment — no event was sent.
          </p>
        )}
      </div>
    </main>
  );
}
