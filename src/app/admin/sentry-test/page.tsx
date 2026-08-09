import { createHash } from "node:crypto";
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
//
// Extended again same day: a first round of presence/shape diagnostics
// found NEXT_PUBLIC_SENTRY_DSN present but shape-mismatched. Vercel's
// own runtime logs independently surfaced "Invalid Sentry Dsn:
// github.com/ordift-studios/ordift-studios-website" — a real SDK parse
// failure, not a guess — so this round adds a structural breakdown (has
// https prefix / has publicKey@host separator / ends in numeric project
// id / literally contains "github.com") to pin down exactly which DSN
// grammar rule fails, plus logs the captureException() event id and
// flush() success boolean (previously called but never recorded) so
// Vercel function logs carry hard evidence instead of silence.
interface DsnShape {
  present: boolean;
  startsWithHttps: boolean;
  hasKeyHostSeparator: boolean;
  endsWithNumericProjectId: boolean;
  containsGithubCom: boolean;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function dsnShape(value: string | undefined): DsnShape {
  return {
    present: Boolean(value),
    startsWithHttps: Boolean(value?.startsWith("https://")),
    hasKeyHostSeparator: Boolean(value?.includes("@")),
    endsWithNumericProjectId: Boolean(value && /\/\d+$/.test(value)),
    containsGithubCom: Boolean(value?.includes("github.com")),
  };
}

function DsnRow({ label, shape }: { label: string; shape: DsnShape }) {
  return (
    <tr>
      <td style={{ padding: "4px 12px 4px 0", color: "#666", verticalAlign: "top" }}>{label}</td>
      <td>
        <strong>{String(shape.present)}</strong>
        {shape.present && (
          <div style={{ color: "#666", fontSize: 12 }}>
            startsWithHttps={String(shape.startsWithHttps)}, hasKeyHostSeparator={String(shape.hasKeyHostSeparator)},
            endsWithNumericProjectId={String(shape.endsWithNumericProjectId)}, containsGithubCom=
            {String(shape.containsGithubCom)}
          </div>
        )}
      </td>
    </tr>
  );
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
    const eventId = Sentry.captureException(testError);
    const flushed = await Sentry.flush(2000);
    // Logged (not just called) so Vercel's own function logs carry
    // evidence of what captureException/flush actually returned,
    // instead of the silent call the first round of this diagnostic
    // shipped with. eventId is a Sentry-generated UUID, never a secret.
    console.log(`[sentry-test] nonce=${nonce} eventId=${eventId} flushed=${flushed}`);
    throw testError;
  }

  const serverShape = dsnShape(process.env.SENTRY_DSN);
  const clientShape = dsnShape(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const orgPresent = Boolean(process.env.SENTRY_ORG);
  const projectPresent = Boolean(process.env.SENTRY_PROJECT);
  // A prior round used a raw `===` here; it reported `true` despite the
  // structural checks above showing clearly different values, and no
  // application-code cause was found (grep confirms both vars are read
  // directly, once each, with no aliasing/fallback anywhere). Rather
  // than trust or keep chasing a possible Turbopack/RSC compile quirk
  // in a throwaway diagnostic, this compares independent SHA-256
  // digests instead — a different computation path, safe to display
  // (hashes aren't reversible) — as corroborating evidence.
  const serverDsnHash = process.env.SENTRY_DSN ? shortHash(process.env.SENTRY_DSN) : null;
  const clientDsnHash = process.env.NEXT_PUBLIC_SENTRY_DSN ? shortHash(process.env.NEXT_PUBLIC_SENTRY_DSN) : null;
  const dsnsMatch = Boolean(serverDsnHash && serverDsnHash === clientDsnHash);

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 560 }}>
      <h1>Sentry Staging Verification</h1>
      <p>Staff/admin only, staging only (404s in Production). Confirms Sentry capture end-to-end.</p>

      <table style={{ marginTop: 24, borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          <DsnRow label="SENTRY_DSN" shape={serverShape} />
          <DsnRow label="NEXT_PUBLIC_SENTRY_DSN" shape={clientShape} />
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
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>DSNs match (sha256[0:8])</td>
            <td>
              <strong>{String(dsnsMatch)}</strong>
              <span style={{ color: "#666" }}>
                {" "}
                (server={serverDsnHash ?? "n/a"}, client={clientDsnHash ?? "n/a"})
              </span>
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
