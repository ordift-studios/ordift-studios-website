import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";

// Temporary, staging-only Sentry verification trigger — 2026-08-09.
// Not a general-purpose debugging endpoint: gated on SITE_ENV=staging
// (404s in Production regardless of routing/config drift) and staff/
// admin auth (same isStaffOrAdmin() check every other admin route
// uses). Throws through a real page render, so it exercises the exact
// same capture paths a genuine production error would — instrumentation.ts's
// onRequestError server-side, and the existing error.tsx boundary's
// Sentry.captureException client-side — rather than inventing new
// capture logic. Delete this file once Sentry is confirmed working;
// it has no ongoing diagnostic value beyond this one verification.
export default async function SentryTestPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string }>;
}) {
  if (process.env.SITE_ENV !== "staging") notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  if (!isStaffOrAdmin(user)) notFound();

  const { confirm } = await searchParams;
  if (confirm === "1") {
    throw new Error("Ordift staging Sentry verification test - safe to ignore");
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 560 }}>
      <h1>Sentry Staging Verification</h1>
      <p>Staff/admin only, staging only (404s in Production). Confirms Sentry capture end-to-end.</p>
      <a
        href="?confirm=1"
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "10px 20px",
          background: "#111",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Trigger test exception
      </a>
    </div>
  );
}
