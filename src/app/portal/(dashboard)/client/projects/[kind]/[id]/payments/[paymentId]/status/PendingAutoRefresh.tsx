"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The gateway webhook confirms a payment asynchronously — a customer
// can land here before it arrives. Poll the server component itself
// (router.refresh() re-runs the page's data fetch) rather than adding
// a client-side data-fetch path just for this one transient state.
export default function PendingAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
