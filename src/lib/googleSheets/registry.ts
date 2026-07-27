// The complete worksheet structure for the "Ordift Studios Operations"
// spreadsheet (see GOOGLE_SHEETS_INTEGRATION.md) — one entry per public
// form or in-portal request type, live or reserved. This is the single
// config surface a future form connects through: add a worksheet key +
// header row here, write a small row-mapper next to the form's own
// schema, and call appendToWorksheet() — no changes needed to the
// writer or setup script.
//
// `live: false` worksheets are fully prepared (created + header row
// written by scripts/setupGoogleSheets.ts) but nothing writes to them
// yet, since the forms that would feed them don't exist in the app yet
// (Client Bookings, Newsletter, Vendor/Model/Employment Applications,
// Equipment Rentals, Studio Reservations). Building those forms is out
// of scope for this pass — see LAUNCH_CANDIDATE_1.md's architecture
// freeze. Project Requests is the exception among the newly-added
// entries: unlike the others, that feature already exists and holds
// real data (src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests),
// so it's wired as a third live integration alongside Workshop
// Registrations and Contact Enquiries — see
// src/lib/projectRequests/sheetsSync.ts.
export type WorksheetKey =
  | "workshopRegistrations"
  | "contactEnquiries"
  | "projectRequests"
  | "clientBookings"
  | "newsletterSubscribers"
  | "vendorApplications"
  | "modelApplications"
  | "employmentApplications"
  | "equipmentRentals"
  | "studioReservations";

export type WorksheetConfig = {
  tabName: string;
  headerRow: string[];
  live: boolean;
};

// Every header row starts with the same five columns (Timestamp, Record
// ID, Submission Source, Status, Assigned Staff) and ends with Last
// Updated, per the requested operational standard — core, form-specific
// fields sit in between. "Assigned Staff" is always admin-filled
// directly in the Sheet (no form ever asks a visitor to assign
// themselves) — same treatment as the other admin-only columns below.
export const WORKSHEET_REGISTRY: Record<WorksheetKey, WorksheetConfig> = {
  workshopRegistrations: {
    tabName: "Workshop Registrations",
    live: true,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Workshop",
      "Workshop Slug",
      "Full Name",
      "Email",
      "Phone",
      "Country",
      "Experience Level",
      "Waiting List Position",
      "Payment Status",
      "Amount Due",
      "Amount Paid",
      "Attendance Status",
      "Consent Timestamp",
      "Internal Notes",
      "Environment",
      "Last Updated",
    ],
  },
  contactEnquiries: {
    tabName: "Contact Enquiries",
    live: true,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Service",
      "Full Name",
      "Company / Brand",
      "Email",
      "Phone",
      "Country",
      "Project Type",
      "Project Location",
      "Timeframe",
      "Budget Range",
      "Description",
      "Reference Link",
      "Heard About Us",
      "Follow-Up Date",
      "Last Contacted",
      "Internal Notes",
      "Consent Timestamp",
      "Source Page",
      "Marketing Consent",
      "Last Updated",
    ],
  },
  projectRequests: {
    tabName: "Project Requests",
    live: true,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Request Type",
      "Related Project Reference",
      "Related Project Type",
      "Client Name",
      "Email",
      "Phone",
      "Client Notes",
      "Staff Response",
      "Decided At",
      "Last Updated",
    ],
  },
  clientBookings: {
    tabName: "Client Bookings",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Client Name",
      "Company",
      "Email",
      "Phone",
      "Service",
      "Booking Date",
      "Location",
      "Notes",
      "Last Updated",
    ],
  },
  newsletterSubscribers: {
    tabName: "Newsletter Subscribers",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Full Name",
      "Email",
      "Interests",
      "Consent Timestamp",
      "Last Updated",
    ],
  },
  vendorApplications: {
    tabName: "Vendor Applications",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Business Name",
      "Contact Name",
      "Email",
      "Phone",
      "Category",
      "Portfolio Link",
      "Notes",
      "Last Updated",
    ],
  },
  modelApplications: {
    tabName: "Model Applications",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Full Name",
      "Email",
      "Phone",
      "Age",
      "Location",
      "Measurements",
      "Portfolio Link",
      "Notes",
      "Last Updated",
    ],
  },
  employmentApplications: {
    tabName: "Employment Applications",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Full Name",
      "Email",
      "Phone",
      "Position",
      "Resume Link",
      "Cover Letter",
      "Notes",
      "Last Updated",
    ],
  },
  equipmentRentals: {
    tabName: "Equipment Rentals",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Renter Name",
      "Email",
      "Phone",
      "Equipment",
      "Rental Start",
      "Rental End",
      "Deposit",
      "Notes",
      "Last Updated",
    ],
  },
  studioReservations: {
    tabName: "Studio Reservations",
    live: false,
    headerRow: [
      "Timestamp",
      "Record ID",
      "Submission Source",
      "Status",
      "Assigned Staff",
      "Client Name",
      "Email",
      "Phone",
      "Studio Space",
      "Reservation Date",
      "Start Time",
      "End Time",
      "Notes",
      "Last Updated",
    ],
  },
};
