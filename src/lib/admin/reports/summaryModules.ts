import { getAllWorkshopRegistrations, REPORT_LIMIT } from "@/lib/portal/data";
import type { ReportRow } from "./types";

// A second, small registry alongside REPORT_MODULES
// (src/lib/admin/reports/registry.ts) — for aggregate reports (grouped/
// counted) rather than one-row-per-record exports. Same reusable shape
// (columns + fetchRows) so it plugs into the exact same CSV/XLSX/email
// utilities; kept separate from REPORT_MODULES because its key space
// isn't the Sheets worksheet set (an aggregate report isn't a
// worksheet, or a form) and its rows are computed, not fetched 1:1.
export type SummaryReportModule = {
  key: string;
  label: string;
  columns: string[];
  fetchRows: () => Promise<ReportRow[]>;
};

async function workshopRegistrationsMonthlySummary(): Promise<ReportRow[]> {
  const registrations = await getAllWorkshopRegistrations({}, REPORT_LIMIT);

  const byMonth = new Map<string, { registered: number; waitlisted: number }>();
  for (const r of registrations) {
    const month = r.registrationDate.slice(0, 7); // "YYYY-MM"
    const bucket = byMonth.get(month) ?? { registered: 0, waitlisted: 0 };
    if (r.registrationStatus === "Registered") bucket.registered += 1;
    else if (r.registrationStatus === "Waitlisted") bucket.waitlisted += 1;
    byMonth.set(month, bucket);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { registered, waitlisted }]) => ({
      Month: month,
      Registered: registered,
      Waitlisted: waitlisted,
      Total: registered + waitlisted,
    }));
}

export const SUMMARY_REPORT_MODULES: Record<string, SummaryReportModule> = {
  workshopRegistrationsMonthly: {
    key: "workshopRegistrationsMonthly",
    label: "Monthly Workshop Registration Summary",
    columns: ["Month", "Registered", "Waitlisted", "Total"],
    fetchRows: workshopRegistrationsMonthlySummary,
  },
};

export function getSummaryReportModule(key: string): SummaryReportModule | undefined {
  return SUMMARY_REPORT_MODULES[key];
}

export function listSummaryReportModules(): SummaryReportModule[] {
  return Object.values(SUMMARY_REPORT_MODULES);
}
