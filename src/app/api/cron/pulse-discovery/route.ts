import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { editorialClient } from "@/sanity/lib/client";
import { runDiscoveryForSource, listActiveSourceIds } from "@/lib/pulse/ingestion";

// Ordift Pulse — Adaptive Discovery Remediation (2026-09-08). The
// recurring-discovery entry point, invoked once daily by Vercel Cron
// (see vercel.json — "0 3 * * *", 03:00 UTC). Reuses the EXACT same
// discovery pipeline as the manual Admin trigger
// (/api/admin/pulse/run-discovery) — runDiscoveryForSource() — nothing
// here duplicates ingestion logic; this route only orchestrates WHEN
// and FOR WHICH sources it runs, and how the invocation is
// authenticated.
//
// Discovery still never publishes, rejects, or archives anything —
// that guarantee lives inside runDiscoveryForSource() itself (status
// is always "draft"), unaffected by who or what triggers it.
//
// Authentication (Part 11 — must not masquerade as a human Admin):
// verifies the standard Vercel Cron convention — an `Authorization:
// Bearer <CRON_SECRET>` header, which Vercel automatically attaches to
// its own cron-triggered requests once a CRON_SECRET env var exists on
// the project (see Vercel's own Cron Jobs documentation). This route
// never generates, stores, or displays that secret's value — only
// compares the incoming header against process.env.CRON_SECRET. If
// CRON_SECRET is not configured at all, every request is refused
// (fails closed) rather than allowing an unauthenticated invocation —
// the same "fail closed" direction every other Pulse default already
// takes (see ingestion.ts's own discoveryEnabled comment).
// activity_log rows this route writes use logActivityAsSystem() with
// actorUserId: null — never a real human's id — so a cron-triggered
// run is never misattributed to whichever Admin happened to be online.

export const maxDuration = 30;

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no configured secret means no automated runs, ever
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sourceIds = await listActiveSourceIds(editorialClient);

  const results = [];
  for (const sourceId of sourceIds) {
    const result = await runDiscoveryForSource(
      sourceId,
      editorialClient,
      async (summary) => {
        await logActivityAsSystem({
          actorUserId: null,
          action: "pulse.discovery_run",
          entityType: "pulseSource",
          entityId: summary.sourceId,
          metadata: { ...summary, trigger: "cron" },
        });
      },
      async (started) => {
        await logActivityAsSystem({
          actorUserId: null,
          action: "pulse.discovery_run_started",
          entityType: "pulseSource",
          entityId: started.sourceId,
          metadata: { ...started, trigger: "cron" },
        });
      }
    );
    results.push(result);
  }

  // Not itself an activity_log row (each per-source run already wrote
  // its own) — this is only the HTTP response Vercel's cron dispatcher
  // records, useful when inspecting invocation logs directly.
  return NextResponse.json({ ok: true, sourcesRun: sourceIds.length, results });
}
