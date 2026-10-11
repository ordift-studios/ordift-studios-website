import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// B1 sends NOTHING. These guards fail if any B1 module starts importing an email / notification sender, so a
// reminder cannot be added by accident — that is B2 and needs its own approval.
const B1_FILES = [
  "src/lib/crewSupport/schedule.ts", "src/lib/crewSupport/readinessRules.ts", "src/lib/crewSupport/readiness.ts", "src/lib/crewSupport/readinessIssues.ts", "src/lib/crewSupport/reschedule.ts",
  "src/app/admin/crew-support/readinessAdminActions.ts", "src/app/admin/crew-support/ScheduleReadinessPanel.tsx", "src/app/admin/crew-support/readiness-settings/page.tsx",
  "src/app/portal/(dashboard)/collaborator/readinessActions.ts", "src/components/portal/ReadinessPanel.tsx",
];
const FORBIDDEN = ["dispatchNotification", "sendEmail", "sendFilesReadyEmail", "notifyCrew", "lifecycleEmails", "crewNotifications", "shared/email", "notifications/dispatch", "fetch("];

describe("B1 sends no notifications", () => {
  for (const f of B1_FILES) {
    it(f, () => {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      for (const w of FORBIDDEN) expect(src, `${f} must not reference ${w}`).not.toContain(w);
    });
  }
});

describe("readiness never touches job reports, files, deliverables, engagement status, payables or payments", () => {
  const WRITES = ["project_files", "deliverables", "assignment_reports", "payment_obligations", "payments", "setEngagementStatus", "createEngagementPayable"];
  for (const f of B1_FILES.filter((x) => x.includes("readiness") || x.includes("reschedule"))) {
    it(f, () => {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      for (const w of WRITES) expect(src, `${f} must not reference ${w}`).not.toContain(w);
    });
  }
  it("the only thing a reschedule writes to the engagement is its derived dates, inside the database function", () => {
    const sql = readFileSync("supabase/migrations/0153_assignment_readiness_and_schedule_integrity.sql", "utf8");
    const fn = sql.slice(sql.indexOf("create or replace function public.reschedule_assignment"), sql.indexOf("grant execute on function public.reschedule_assignment"));
    expect(fn).toMatch(/update public\.engagements e set starts_at = p_start, ends_at = p_end/);
    expect(fn).not.toMatch(/update public\.engagements[^;]*\bset\s+status/i);
    expect(fn).not.toMatch(/payment|payable|deliverable|project_files/);
  });
});

describe("the migration is additive and safe", () => {
  const sql = readFileSync("supabase/migrations/0153_assignment_readiness_and_schedule_integrity.sql", "utf8");
  it("only creates objects and adds one nullable column; never drops, deletes, truncates or rewrites existing rows", () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function|policy|trigger)\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    const updates = [...sql.matchAll(/^\s*update\s+public\.(\w+)/gim)].map((m) => m[1]);
    expect(new Set(updates)).toEqual(new Set(["crew_support_requests", "engagements"])); // only inside reschedule_assignment()
    expect(sql).toMatch(/add column event_timezone text;/);
    expect(sql).not.toMatch(/alter table public\.(enquiries|payments|payment_obligations|engagements|client_quotations)/i);
  });
  it("every new table has RLS on, no direct write grant for ordinary sessions and no DELETE for anyone", () => {
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    expect(tables).toHaveLength(8 - 1); // schedule_changes, notices, settings, readiness, responses, issues, issue_events
    for (const t of tables) expect(sql).toContain(`alter table public.${t} enable row level security`);
    expect(sql).not.toMatch(/grant[^;]*\b(insert|update|delete)\b[^;]*to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*\bdelete\b/i);
  });
  it("the rollback exists and is guarded", () => {
    const down = readFileSync("supabase/rollbacks/down_0153.sql", "utf8");
    expect(down).toContain("Refusing");
    expect(readdirSync("supabase/rollbacks")).toContain("down_0153.sql");
  });
  it("reminders and automatic enrolment cannot be switched on in B1", () => {
    expect(sql).toMatch(/check \(reminders_enabled = false\)/);
    expect(sql).toMatch(/check \(auto_enrol_from is null\)/);
  });
});
