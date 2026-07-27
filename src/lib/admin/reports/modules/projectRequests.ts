import { getAllProjectRequests, PROJECT_REQUEST_STATUSES, PROJECT_REQUEST_STATUS_LABELS } from "@/lib/admin/projectRequests";
import type { ReportModule } from "../types";

export const projectRequestsModule: ReportModule = {
  key: "projectRequests",
  label: "Project Requests",
  live: true,
  columns: [
    "Record ID",
    "Date",
    "Client",
    "Email",
    "Phone",
    "Request Type",
    "Related Project",
    "Status",
    "Client Notes",
    "Staff Response",
  ],
  statusOptions: PROJECT_REQUEST_STATUSES.map((s) => ({
    value: s,
    label: PROJECT_REQUEST_STATUS_LABELS[s],
  })),
  async fetchRows(filters) {
    const rows = await getAllProjectRequests({
      search: filters.search,
      status: filters.status,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });

    return rows.map((r) => ({
      "Record ID": r.referenceNumber ?? "",
      Date: r.createdAt,
      Client: r.clientName,
      Email: r.email,
      Phone: r.phone ?? "",
      "Request Type": r.requestTypeLabel,
      "Related Project": `${r.relatedProjectType} — ${r.relatedProjectReference}`,
      Status: PROJECT_REQUEST_STATUS_LABELS[r.status],
      "Client Notes": r.clientNotes ?? "",
      "Staff Response": r.staffResponse ?? "",
    }));
  },
};
