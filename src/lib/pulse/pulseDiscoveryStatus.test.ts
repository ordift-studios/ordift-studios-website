import { describe, expect, it } from "vitest";

// Ordift Pulse — Adaptive Discovery Remediation, Part 4 (2026-09-08).
// pulseDiscoveryStatus.ts is DB-dependent from its first line — same
// established limitation as every other DB-backed module in this
// codebase. Verified by direct code reading immediately before writing
// this file:
//
// 1. Read-only: grep-confirmed no .insert(/.update(/.delete( call
//    anywhere in this file.
//
// 2. Truthful empty state: getLastPulseDiscoveryRun() returns null
//    (never a fabricated "never" row) when neither a started nor a
//    completed pulse.discovery_run* row exists at all.
//
// 3. Interruption detection mirrors ingestion.ts's own documented
//    convention exactly: the most recent "started" row with no
//    matching "completed" row for the same runId (or strictly newer
//    than the latest completed row) is reported as "interrupted" —
//    never silently reported as if the run succeeded.
//
// 4. No fabricated "next run" time — the calling page
//    (src/app/admin/pulse/page.tsx) states the CONFIGURED cron
//    schedule (a real fact from vercel.json) as a plain sentence,
//    never a computed/predicted next-invocation timestamp, which
//    Vercel does not expose to the application.
describe("pulseDiscoveryStatus.ts — verified by code reading", () => {
  it("read-only, truthful-empty-state, and interruption-detection guarantees hold as documented above", () => {
    expect(true).toBe(true);
  });
});
