import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { google } from "googleapis";
import { productionSendingEnabled } from "@/lib/shared/env";
import type { EnquiryInput } from "./schema";

export type EnquiryRecord = EnquiryInput & {
  referenceNumber: string;
  submittedAt: string;
  environment: "staging" | "production";
};

export type SaveResult =
  | { ok: true; mode: "test-log" | "google-sheets" }
  | { ok: false; error: string };

const TEST_LOG_DIR = path.join(process.cwd(), ".data");
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, "staging-enquiries.jsonl");

// Staging (and any non-legally-approved deploy) always lands here — never
// in the production Sheet, regardless of whether Google credentials
// happen to be configured. This is the "separate test workflow" the
// approved spec requires.
async function saveToTestLog(record: EnquiryRecord): Promise<SaveResult> {
  try {
    await mkdir(TEST_LOG_DIR, { recursive: true });
    await appendFile(TEST_LOG_FILE, JSON.stringify(record) + "\n", "utf8");
    return { ok: true, mode: "test-log" };
  } catch (err) {
    console.error("[enquiry] failed to write staging test log", err);
    return { ok: false, error: "test-log-write-failed" };
  }
}

// Column order matches GOOGLE_SHEETS_MAPPING.md — keep both in sync.
// Columns Q–X (Enquiry Status through Marketing Consent) are the internal
// management block approved 2026-07-23: Enquiry Status, Consent
// Timestamp, Source Page and Marketing Consent are auto-populated here;
// Assigned To, Follow-Up Date, Last Contacted and Internal Notes are left
// blank for an administrator to fill in directly in the Sheet — the
// public form never asks for them.
function toSheetRow(record: EnquiryRecord): string[] {
  return [
    record.referenceNumber,
    record.submittedAt,
    record.environment,
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
    "New", // Q: Enquiry Status (system default; admin updates from here)
    "", // R: Assigned To (admin-filled)
    "", // S: Follow-Up Date (admin-filled)
    "", // T: Last Contacted (admin-filled)
    "", // U: Internal Notes (admin-filled)
    record.submittedAt, // V: Consent Timestamp (consent is captured at submission)
    record.sourcePage ?? "", // W: Source Page
    record.marketingConsent ? "Yes" : "No", // X: Marketing Consent
  ];
}

async function saveToGoogleSheets(record: EnquiryRecord): Promise<SaveResult> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    console.error(
      "[enquiry] production sending is enabled but Google Sheets credentials are missing — refusing to silently drop a real enquiry"
    );
    return { ok: false, error: "google-sheets-not-configured" };
  }

  try {
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Enquiries!A:X",
      valueInputOption: "RAW",
      requestBody: { values: [toSheetRow(record)] },
    });
    return { ok: true, mode: "google-sheets" };
  } catch (err) {
    console.error("[enquiry] Google Sheets append failed", err);
    return { ok: false, error: "google-sheets-append-failed" };
  }
}

export async function saveEnquiry(record: EnquiryRecord): Promise<SaveResult> {
  if (!productionSendingEnabled()) {
    return saveToTestLog(record);
  }
  return saveToGoogleSheets(record);
}
