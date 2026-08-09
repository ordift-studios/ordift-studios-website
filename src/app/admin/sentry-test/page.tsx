import { notFound, redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";

// Temporary, staging-only Sentry verification trigger — 2026-08-09,
// extended same day after the first manual check found no event in
// Sentry. Not a general-purpose debugging endpoint: gated on
// SITE_ENV=staging (404s in Production regardless of routing/config
// drift) and staff/admin auth (same isStaffOrAdmin() check every other
// admin route uses).
//
// This page's own render is the diagnostic: reading process.env here
// executes inside the real Vercel Function at real request time, not
// through any local CLI tool — so it's authoritative about what the
// deployed app actually has, sidestepping the fact that
// `vercel env ls`/`env run` cannot distinguish a Sensitive-but-present
// variable from a genuinely-empty one. Never renders the DSN value
// itself, only presence/shape booleans.
//
// On confirm=1: explicitly calls Sentry.captureException() (per
// explicit instruction, since a bare `throw` alone wasn't confirmed to
// reliably exercise that call) with a unique nonce so the resulting
// Sentry issue is unambiguously this test run, flushes before the
// function can terminate, then still throws so the existing error.tsx
// boundary's own Sentry.captureException also fires client-side —
// exercising both capture paths in one trigger.
//
// Delete this file once Sentry is confirmed working; it has no ongoing
// diagnostic value beyond this one verification.
function shapeCheck(value: string | undefined): "empty" | "valid_dsn_shape" | "unexpected_shape" {
  if (!value) return "empty";
  return value.startsWith("https://") && value.includes(".ingest.") && value.includes(".sentry.io")
    ? "valid_dsn_shape"
    : "unexpected_shape";
}

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
    // Always throws below — this branch never produces a stable render,
    // so React's re-render-idempotency concern for impure calls doesn't
    // apply; the nonce only needs to be unique per manual trigger.
    // eslint-disable-next-line react-hooks/purity
    const nonce = Date.now().toString(36);
    const testError = new Error(`Ordift staging Sentry verification test [${nonce}] - safe to ignore`);
    Sentry.captureException(testError);
    await Sentry.flush(2000);
    throw testError;
  }

  const serverDsnPresent = Boolean(process.env.SENTRY_DSN);
  const clientDsnPresent = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const orgPresent = Boolean(process.env.SENTRY_ORG);
  const projectPresent = Boolean(process.env.SENTRY_PROJECT);

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 560 }}>
      <h1>Sentry Staging Verification</h1>
      <p>Staff/admin only, staging only (404s in Production). Confirms Sentry capture end-to-end.</p>

      <table style={{ marginTop: 24, borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>SENTRY_DSN present</td>
            <td>
              <strong>{String(serverDsnPresent)}</strong>
              {serverDsnPresent && <span style={{ color: "#666" }}> ({shapeCheck(process.env.SENTRY_DSN)})</span>}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>NEXT_PUBLIC_SENTRY_DSN present</td>
            <td>
              <strong>{String(clientDsnPresent)}</strong>
              {clientDsnPresent && (
                <span style={{ color: "#666" }}> ({shapeCheck(process.env.NEXT_PUBLIC_SENTRY_DSN)})</span>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>SENTRY_ORG present</td>
            <td>
              <strong>{String(orgPresent)}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>SENTRY_PROJECT present</td>
            <td>
              <strong>{String(projectPresent)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <a
        href="?confirm=1"
        style={{
          display: "inline-block",
          marginTop: 24,
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
