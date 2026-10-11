import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static checks on the scheduler wiring: nothing here calls a network or a database.
const workflow = readFileSync(".github/workflows/readiness-reminders.yml", "utf8");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };

describe("GitHub Actions scheduler workflow", () => {
  it("runs hourly, off the top of the hour, and can be started by hand", () => {
    expect(workflow).toMatch(/cron: "17 \* \* \* \*"/);
    expect(workflow).toMatch(/workflow_dispatch/);
  });
  it("is inert until the repository variable is exactly 'true'", () => {
    expect(workflow).toContain("vars.READINESS_SCHEDULER_ENABLED == 'true'");
  });
  it("has no token permissions and cannot overlap itself", () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    expect(workflow).toMatch(/group: readiness-reminders/);
    expect(workflow).toMatch(/cancel-in-progress: false/);
  });
  it("takes the secret from GitHub secrets only, never a literal, and never echoes it", () => {
    expect(workflow).toContain("${{ secrets.CRON_SECRET }}");
    expect(workflow).not.toMatch(/Bearer [A-Za-z0-9_-]{16,}/);
    expect(workflow).not.toMatch(/echo[^\n]*CRON_SECRET/);
    expect(workflow).not.toMatch(/set -x|--verbose|curl -v/);
  });
  it("only calls an https URL and fails the run on a non-200", () => {
    expect(workflow).toContain("https://*");
    expect(workflow).toContain('[ "$code" = "200" ]');
  });
  it("tells the app which trigger it is", () => {
    expect(workflow).toContain("x-scheduler-trigger: github");
  });
});

describe("Vercel cron sweep", () => {
  const entry = vercel.crons.find((c) => c.path === "/api/cron/readiness-reminders");
  it("exists as a free-plan-compatible daily schedule (Hobby allows once per day)", () => {
    expect(entry).toBeDefined();
    const [min, hour, dom, mon, dow] = entry!.schedule.split(" ");
    expect(Number.isInteger(Number(min)) && Number.isInteger(Number(hour))).toBe(true);
    expect([dom, mon, dow]).toEqual(["*", "*", "*"]);
  });
  it("keeps the existing Pulse cron untouched", () => {
    expect(vercel.crons.find((c) => c.path === "/api/cron/pulse-discovery")).toEqual({ path: "/api/cron/pulse-discovery", schedule: "0 3 * * *" });
  });
});
