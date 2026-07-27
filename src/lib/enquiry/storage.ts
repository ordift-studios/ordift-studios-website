import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { productionSendingEnabled } from "@/lib/shared/env";
import { appendToWorksheet } from "@/lib/googleSheets/writer";
import { logSheetSyncFailure } from "@/lib/shared/sheetSyncFailures";
import type { EnquiryInput } from "./schema";

export type EnquiryRecord = EnquiryInput & {
  referenceNumber: string;
  submittedAt: string;
  environment: "staging" | "production";
};

// Staging (and any non-legally-approved deploy) always lands here —
// never in the real Sheet, regardless of whether Google credentials
// happen to be configured. This is now purely a secondary audit trail:
// Supabase (src/lib/supabase/primaryWrite.ts) is the primary,
// production-sending-independent record in both environments.
const TEST_LOG_DIR = path.join(process.cwd(), ".data");
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, "staging-enquiries.jsonl");

async function appendToTestLog(record: EnquiryRecord): Promise<void> {
  try {
    await mkdir(TEST_LOG_DIR, { recursive: true });
    await appendFile(TEST_LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[enquiry] failed to write staging test log", err);
  }
}

// Column order matches the "Contact Enquiries" worksheet config in
// src/lib/googleSheets/registry.ts — keep both in sync. Assigned To,
// Assigned Staff, Follow-Up Date, Last Contacted and Internal Notes are
// left blank for an administrator to fill in directly in the Sheet; the
// public form never asks for them.
function toSheetRow(record: EnquiryRecord): (string | number)[] {
  return [
    record.submittedAt,
    record.referenceNumber,
    "Website Form",
    "New",
    "", // Assigned Staff (admin-filled)
    record.service,
    record.fullName,
    record.companyName ?? "",
    record.email,
    record.phone,
    record.country ?? "",
    record.projectType ?? "",
    record.projectLocation ?? "",
    record.timeframe ?? "",
    record.budgetRange ?? "",
    record.description,
    record.referenceLink ?? "",
    record.hearAboutUs ?? "",
    "", // Follow-Up Date (admin-filled)
    "", // Last Contacted (admin-filled)
    "", // Internal Notes (admin-filled)
    record.submittedAt, // Consent Timestamp — captured at submission
    record.sourcePage ?? "",
    record.marketingConsent ? "Yes" : "No",
    record.submittedAt, // Last Updated
  ];
}

// Best-effort secondary copy (2026-07-27: Supabase is now primary — see
// src/lib/supabase/primaryWrite.ts). Never throws and never fails the
// caller: a failed Sheets append is logged to sheet_sync_failures for
// later retry instead of blocking or losing the already-saved
// enquiry.
export async function syncEnquiryToSheets(record: EnquiryRecord): Promise<void> {
  if (!productionSendingEnabled()) {
    await appendToTestLog(record);
    return;
  }

  const result = await appendToWorksheet("contactEnquiries", toSheetRow(record));
  if (!result.ok) {
    await logSheetSyncFailure({
      worksheetKey: "contactEnquiries",
      recordId: record.referenceNumber,
      rowData: toSheetRow(record),
      errorMessage: result.error,
    });
  }
}
