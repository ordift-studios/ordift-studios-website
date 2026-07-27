import { getAllWorkshopRegistrations, REPORT_LIMIT } from "@/lib/portal/data";
import { REGISTRATION_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/bookings";
import type { ReportModule } from "../types";

// workshopOrServiceOptions is intentionally omitted — the valid set is
// "whichever workshops exist in Sanity right now," which changes
// independently of a deploy. Callers that need the dropdown (the
// /admin/reports and /admin/bookings pages) fetch it themselves via
// contentRepository.getWorkshops() rather than this module baking in a
// snapshot that could go stale.
export const workshopRegistrationsModule: ReportModule = {
  key: "workshopRegistrations",
  label: "Workshop Registrations",
  live: true,
  columns: [
    "Record ID",
    "Date",
    "Name",
    "Email",
    "Phone",
    "Workshop",
    "Status",
    "Waiting List Position",
    "Payment Status",
    "Amount Due",
    "Amount Paid",
  ],
  statusOptions: REGISTRATION_STATUSES.map((s) => ({ value: s, label: s })),
  paymentStatusOptions: PAYMENT_STATUSES.map((s) => ({ value: s, label: s })),
  workshopOrServiceLabel: "Workshop",
  async fetchRows(filters) {
    const rows = await getAllWorkshopRegistrations(
      {
        search: filters.search,
        status: filters.status,
        paymentStatus: filters.paymentStatus,
        workshopSlug: filters.workshopOrService,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      },
      REPORT_LIMIT
    );

    return rows.map((r) => ({
      "Record ID": r.registrationReference,
      Date: r.registrationDate,
      Name: r.fullName,
      Email: r.email,
      Phone: r.phone ?? "",
      Workshop: r.workshopTitle,
      Status: r.registrationStatus,
      "Waiting List Position": r.waitingListPosition ?? "",
      "Payment Status": r.paymentStatus,
      "Amount Due": r.amountDue ?? "",
      "Amount Paid": r.amountPaid ?? "",
    }));
  },
};
