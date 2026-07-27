import type { WorksheetKey } from "@/lib/googleSheets/registry";

// A report row is already flattened to exactly the module's declared
// `columns`, in order — this is what makes the CSV/XLSX/email layer
// (csv.ts, xlsx.ts, sendReportEmail.ts) fully generic: none of them
// know or care what an "Enquiry" or a "Workshop Registration" is, only
// that they're handed { columns: string[], rows: ReportRow[] }.
export type ReportRow = Record<string, string | number | null>;

export type ReportFilters = {
  search?: string;
  status?: string;
  paymentStatus?: string;
  // Meaning is module-specific: a Sanity workshop slug for Workshop
  // Registrations, a pathway value for Contact Enquiries, unused
  // elsewhere.
  workshopOrService?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type FilterOption = { value: string; label: string };

// One entry per worksheet key (src/lib/googleSheets/registry.ts) — the
// same 10-entity set, same live/reserved split, so a form connected to
// Sheets is automatically reportable and vice versa. Registering a
// future module here (real fetchRows + columns) is the only step
// needed to light it up across search/filter/export/email — no other
// file changes.
export type ReportModule = {
  key: WorksheetKey;
  label: string;
  live: boolean;
  columns: string[];
  statusOptions?: FilterOption[];
  paymentStatusOptions?: FilterOption[];
  workshopOrServiceLabel?: string;
  workshopOrServiceOptions?: FilterOption[]; // omitted where options are looked up dynamically
  fetchRows: (filters: ReportFilters) => Promise<ReportRow[]>;
};
