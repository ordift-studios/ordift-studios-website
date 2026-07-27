import { WORKSHEET_REGISTRY, type WorksheetKey } from "@/lib/googleSheets/registry";
import type { ReportModule } from "../types";

// The 7 worksheet-only entities with no live form/table yet (Client
// Bookings, Newsletter Subscribers, Vendor/Model/Employment
// Applications, Equipment Rentals, Studio Reservations). Registered
// here — not omitted — so they show up in the Admin Portal as "not yet
// live" rather than silently missing, and so the moment a real form/
// table exists for one, swapping this factory-generated entry for a
// real fetchRows implementation is the only change needed anywhere.
const RESERVED_KEYS: WorksheetKey[] = [
  "clientBookings",
  "newsletterSubscribers",
  "vendorApplications",
  "modelApplications",
  "employmentApplications",
  "equipmentRentals",
  "studioReservations",
];

export const reservedModules: ReportModule[] = RESERVED_KEYS.map((key) => {
  const config = WORKSHEET_REGISTRY[key];
  return {
    key,
    label: config.tabName,
    live: false,
    // Reuse the Sheets worksheet's own header row minus the columns
    // that only make sense in a spreadsheet (Timestamp/Submission
    // Source duplicate Date/Source implicitly once there's a real
    // table to query) — kept simple since there's no data to shape yet.
    columns: config.headerRow,
    async fetchRows() {
      return [];
    },
  };
});
