import { createAdminClient } from "@/lib/supabase/admin";

// Ordift Pulse — Adaptive Discovery Remediation, Part 4 (2026-09-08).
// Read-only "is Pulse alive" status for the Admin Pulse area, built
// entirely from the activity_log rows discovery already writes
// (pulse.discovery_run_started / pulse.discovery_run) — no new table.
// No internal auth gate, matching the established precedent
// (masterRegistry.ts, governanceOverview.ts, talentOverview.ts) — the
// calling page is the real boundary, and activity_log's own RLS is
// staff-read-only regardless of this module using the admin client.

export type PulseDiscoveryRunStatus = "successful" | "completed_with_errors" | "interrupted";

export type LastPulseDiscoveryRun = {
  status: PulseDiscoveryRunStatus;
  occurredAt: string;
  trigger: "cron" | "manual" | "unknown";
  sourceName: string;
  created: number;
  fetched: number;
  errorCount: number;
};

type StartedRow = { created_at: string; entity_id: string; metadata: { runId?: string; sourceName?: string; trigger?: string } | null };
type CompletedRow = { created_at: string; entity_id: string; metadata: { runId?: string; sourceName?: string; trigger?: string; created?: number; fetched?: number; errors?: string[] } | null };

// Reports the single most recent discovery attempt across every
// source — not one row per source — since "is Pulse alive" is
// answered by the latest thing that happened, whichever source it was
// for. Returns null when discovery has genuinely never run (a
// truthful empty state, never a fabricated "never" placeholder row).
export async function getLastPulseDiscoveryRun(): Promise<LastPulseDiscoveryRun | null> {
  const admin = createAdminClient();

  const [{ data: started }, { data: completed }] = await Promise.all([
    admin.from("activity_log").select("created_at, entity_id, metadata").eq("action", "pulse.discovery_run_started").order("created_at", { ascending: false }).limit(1),
    admin.from("activity_log").select("created_at, entity_id, metadata").eq("action", "pulse.discovery_run").order("created_at", { ascending: false }).limit(1),
  ]);

  const latestStarted = (started as StartedRow[] | null)?.[0] ?? null;
  const latestCompleted = (completed as CompletedRow[] | null)?.[0] ?? null;

  if (!latestStarted && !latestCompleted) return null;

  // A "started" with no completed row at all, or a "started" strictly
  // newer than the latest "completed" row and carrying a different
  // runId, means the most recent attempt never finished — the same
  // "started with no matching completed" interruption signal
  // ingestion.ts's own reliability design already establishes.
  const startedIsMostRecentAndUnmatched =
    latestStarted && (!latestCompleted || new Date(latestStarted.created_at).getTime() > new Date(latestCompleted.created_at).getTime()) && latestStarted.metadata?.runId !== latestCompleted?.metadata?.runId;

  if (startedIsMostRecentAndUnmatched && latestStarted) {
    return {
      status: "interrupted",
      occurredAt: latestStarted.created_at,
      trigger: (latestStarted.metadata?.trigger as "cron" | "manual" | undefined) ?? "unknown",
      sourceName: latestStarted.metadata?.sourceName ?? "Unknown source",
      created: 0,
      fetched: 0,
      errorCount: 0,
    };
  }

  if (!latestCompleted) return null;

  const errorCount = latestCompleted.metadata?.errors?.length ?? 0;
  return {
    status: errorCount > 0 ? "completed_with_errors" : "successful",
    occurredAt: latestCompleted.created_at,
    trigger: (latestCompleted.metadata?.trigger as "cron" | "manual" | undefined) ?? "unknown",
    sourceName: latestCompleted.metadata?.sourceName ?? "Unknown source",
    created: latestCompleted.metadata?.created ?? 0,
    fetched: latestCompleted.metadata?.fetched ?? 0,
    errorCount,
  };
}
