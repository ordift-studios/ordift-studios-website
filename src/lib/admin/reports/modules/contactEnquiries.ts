import { getAllEnquiries, crmStageLabel, REPORT_LIMIT } from "@/lib/portal/data";
import { CRM_STAGES } from "@/lib/admin/enquiries";
import { PATHWAYS } from "@/lib/enquiry/pathways";
import type { ReportModule } from "../types";

export const contactEnquiriesModule: ReportModule = {
  key: "contactEnquiries",
  label: "Contact Enquiries",
  live: true,
  columns: [
    "Record ID",
    "Date",
    "Name",
    "Email",
    "Phone",
    "Service",
    "Status",
    "Payment Status",
    "Amount Due",
    "Amount Paid",
  ],
  statusOptions: CRM_STAGES.map((stage) => ({ value: stage, label: crmStageLabel(stage) })),
  workshopOrServiceLabel: "Service",
  workshopOrServiceOptions: PATHWAYS.map((p) => ({ value: p.value, label: p.label })),
  async fetchRows(filters) {
    const rows = await getAllEnquiries(
      {
        search: filters.search,
        stage: filters.status,
        paymentStatus: filters.paymentStatus,
        service: filters.workshopOrService,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      },
      REPORT_LIMIT
    );

    return rows.map((r) => ({
      "Record ID": r.referenceNumber,
      Date: r.submittedAt,
      Name: r.fullName,
      Email: r.email,
      Phone: r.phone ?? "",
      Service: r.service,
      Status: crmStageLabel(r.crmStage),
      "Payment Status": r.paymentStatus ?? "",
      "Amount Due": r.amountDue ?? "",
      "Amount Paid": r.amountPaid ?? "",
    }));
  },
};
