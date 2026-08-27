import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
// Native-draft architecture (2026-08-27) — discovery writes and its own
// dedup read must see the draft namespace (both newly-created drafts
// and previously-discovered ones still awaiting review), so this route
// hands runDiscoveryForSource the explicit draft-aware client rather
// than the bare, apiVersion-dependent-default one.
import { editorialClient } from "@/sanity/lib/client";
import { runDiscoveryForSource } from "@/lib/pulse/ingestion";

// Reliability fix (2026-08-25) — a deliberately modest, explicit ceiling,
// not an attempt to reach this Hobby-plan project's actual platform
// maximum (currently 300s with Fluid Compute, verified live against
// Vercel's own account/project settings — see the Phase B closure
// report for how that was confirmed). MAX_ITEMS_PER_RUN in ingestion.ts
// already bounds a normal run to a handful of seconds; this exists so a
// genuinely stuck request (e.g. a hung external fetch) fails fast and
// predictably instead of silently running for up to 5 minutes.
export const maxDuration = 30;

// Admin-triggered manual discovery run (Phase B, 2026-08-24 — see
// PULSE_INGESTION_FOUNDATION.md). Deliberately manual-trigger only, not
// wired to any scheduled Cron job — Vercel Cron only fires on Production
// deployments, so a Staging-testable path needs a real trigger a human
// can invoke; this route is that trigger. Admin/Super Admin gated,
// mirroring /admin/recruitment's narrower-than-staff gate (this action
// makes real outbound network requests and Sanity writes, same
// sensitivity class). No source is ever activated by this route itself
// — it only runs discovery for whichever source id is passed, and that
// source's own `isActive`/`permissionClassification` are still enforced
// inside runDiscoveryForSource regardless of who calls this.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }
  const sourceId = (body as { sourceId?: unknown })?.sourceId;
  if (typeof sourceId !== "string" || sourceId.length === 0) {
    return NextResponse.json({ ok: false, error: "missing-sourceId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await runDiscoveryForSource(
    sourceId,
    editorialClient,
    async (summary) => {
      const { error } = await admin.from("activity_log").insert({
        actor_user_id: user.id,
        action: "pulse.discovery_run",
        entity_type: "pulseSource",
        entity_id: summary.sourceId,
        metadata: summary,
      });
      if (error) {
        console.error("[pulse] failed to write activity_log for discovery run", error.message);
      }
    },
    // Reliability fix (2026-08-25) — written immediately before the risky
    // work begins (see ingestion.ts). A "started" row with no matching
    // "pulse.discovery_run" row for the same runId is itself the evidence
    // of an abrupt interruption — nothing can write a record any later
    // than this if the function is killed outright.
    async (started) => {
      const { error } = await admin.from("activity_log").insert({
        actor_user_id: user.id,
        action: "pulse.discovery_run_started",
        entity_type: "pulseSource",
        entity_id: started.sourceId,
        metadata: started,
      });
      if (error) {
        console.error("[pulse] failed to write activity_log for discovery run start", error.message);
      }
    }
  );

  return NextResponse.json({ ok: true, result });
}
