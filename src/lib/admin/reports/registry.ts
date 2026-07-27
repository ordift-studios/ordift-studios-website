import type { WorksheetKey } from "@/lib/googleSheets/registry";
import type { ReportModule } from "./types";
import { contactEnquiriesModule } from "./modules/contactEnquiries";
import { workshopRegistrationsModule } from "./modules/workshopRegistrations";
import { projectRequestsModule } from "./modules/projectRequests";
import { reservedModules } from "./modules/reserved";

// The single registry every reporting surface reads from: the Admin
// Portal's search/filter/view pages, CSV/XLSX export, and the emailed
// on-demand reports. Adding a future form's report support is adding
// one entry here (see modules/reserved.ts's comment for the concrete
// swap-in path) — no other file in src/app/api/admin/reports or
// src/app/admin/reports needs to change.
export const REPORT_MODULES: Record<WorksheetKey, ReportModule> = {
  contactEnquiries: contactEnquiriesModule,
  workshopRegistrations: workshopRegistrationsModule,
  projectRequests: projectRequestsModule,
  ...Object.fromEntries(reservedModules.map((m) => [m.key, m])),
} as Record<WorksheetKey, ReportModule>;

export function getReportModule(key: string): ReportModule | undefined {
  return REPORT_MODULES[key as WorksheetKey];
}

export function listReportModules(): ReportModule[] {
  return Object.values(REPORT_MODULES);
}
