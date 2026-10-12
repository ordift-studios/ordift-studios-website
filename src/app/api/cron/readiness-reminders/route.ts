import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runReadinessReminders } from "@/lib/crewSupport/readinessReminders";
import { authenticateScheduler, triggerForChannel } from "@/lib/crewSupport/readinessReminderRules";

// Readiness reminders — scheduler entry point. Three independent triggers call it:
//   * GitHub Actions, hourly   (.github/workflows/readiness-reminders.yml; sends  x-scheduler-trigger: github)
//   * Vercel Cron, daily sweep (vercel.json; Vercel sends its own user agent and Authorization header)
//   * "Run check now" in the admin (a server action calling the same library directly — not this route)
// Authentication is a fail-closed bearer secret compared in constant time. Two credentials are accepted, independently:
//   * READINESS_SCHEDULER_SECRET — dedicated to this feature, used by the GitHub workflow only;
//   * CRON_SECRET — the one Vercel Cron attaches to its own requests automatically (also used by the Pulse cron, which this
//     route only reads and never changes), so the daily Vercel sweep is not rejected.
// Neither value is ever read into a log or a response. Every run is idempotent and single-flight (database lock),
// so a repeated, overlapping or delayed trigger cannot double-send; what is sent is decided by the mode setting
// (off by default). The response carries counts only — no names, addresses or message content.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const channel = authenticateScheduler(request.headers.get("authorization"), { cron: process.env.CRON_SECRET, dedicated: process.env.READINESS_SCHEDULER_SECRET });
  if (!channel) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const trigger = triggerForChannel(channel, { userAgent: request.headers.get("user-agent"), declared: request.headers.get("x-scheduler-trigger") });
  const s = await runReadinessReminders({ trigger });
  const status = s.status === "failed" ? 500 : 200;
  return NextResponse.json({ ok: s.status !== "failed", mode: s.mode, trigger: s.trigger, status: s.status, examined: s.examined, sent: s.sent, skipped: s.skipped, lateSkipped: s.lateSkipped, failed: s.failed, blocked: s.blocked }, { status });
}

export const GET = handle;
export const POST = handle;
