import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { productionSendingEnabled } from "@/lib/shared/env";
import { appendToWorksheet } from "@/lib/googleSheets/writer";
import { logSheetSyncFailure } from "@/lib/shared/sheetSyncFailures";

// Third live Sheets integration, alongside Enquiries and Workshop
// Registrations — unlike those two, Project Requests is an in-portal,
// authenticated client action (not a public form), so Supabase is
// primary "by construction" here (the insert already happens directly
// against the session-scoped client in
// src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions.ts)
// rather than needing an inversion. This module only adds the
// best-effort secondary Sheets copy on top of an already-successful
// Supabase insert — same resilience contract as the other two: never
// throws, never blocks, logs a failed append for retry.
export type ProjectRequestRecord = {
  referenceNumber: string | null;
  requestTypeLabel: string;
  relatedProjectReference: string;
  relatedProjectType: "Enquiry" | "Workshop Registration";
  clientName: string;
  email: string;
  phone: string | null;
  clientNotes: string | null;
  createdAt: string;
};

const TEST_LOG_DIR = path.join(process.cwd(), ".data");
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, "staging-project-requests.jsonl");

async function appendToTestLog(record: ProjectRequestRecord): Promise<void> {
  try {
    await mkdir(TEST_LOG_DIR, { recursive: true });
    await appendFile(TEST_LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[projectRequests] failed to write staging test log", err);
  }
}

// Column order matches the "Project Requests" worksheet config in
// src/lib/googleSheets/registry.ts — keep both in sync.
function toSheetRow(record: ProjectRequestRecord): (string | number)[] {
  return [
    record.createdAt,
    record.referenceNumber ?? "",
    "Client Portal",
    "Pending",
    "", // Assigned Staff (admin-filled)
    record.requestTypeLabel,
    record.relatedProjectReference,
    record.relatedProjectType,
    record.clientName,
    record.email,
    record.phone ?? "",
    record.clientNotes ?? "",
    "", // Staff Response (admin-filled once decided)
    "", // Decided At (admin-filled once decided)
    record.createdAt, // Last Updated
  ];
}

export async function syncProjectRequestToSheets(record: ProjectRequestRecord): Promise<void> {
  if (!productionSendingEnabled()) {
    await appendToTestLog(record);
    return;
  }

  const result = await appendToWorksheet("projectRequests", toSheetRow(record));
  if (!result.ok) {
    await logSheetSyncFailure({
      worksheetKey: "projectRequests",
      recordId: record.referenceNumber ?? "(no reference number)",
      rowData: toSheetRow(record),
      errorMessage: result.error,
    });
  }
}
