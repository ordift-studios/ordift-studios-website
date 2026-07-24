import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { google } from "googleapis";
import { productionSendingEnabled } from "@/lib/shared/env";
import type { WorkshopRegistrationInput } from "./registrationSchema";
import type { Workshop } from "@/lib/content/types";

export type RegistrationStatus = "Registered" | "Waitlisted";
export type PaymentStatus = "Not Required" | "Pending" | "Paid" | "Refunded";

export type WorkshopRegistrationRecord = WorkshopRegistrationInput & {
  registrationReference: string;
  workshopId: string;
  workshopTitle: string;
  registrationDate: string;
  registrationStatus: RegistrationStatus;
  waitingListPosition: number | null;
  paymentStatus: PaymentStatus;
  environment: "staging" | "production";
};

export type SaveResult =
  | { ok: true; mode: "test-log" | "google-sheets" }
  | { ok: false; error: string };

// Deliberately separate from the enquiry test log — Workshop
// Registrations is a structurally distinct dataset (Plan Part J /
// approved 2026-07-23), not a variant of Enquiries. Same isolation
// principle: never mixed, never committed (see .gitignore).
const TEST_LOG_DIR = path.join(process.cwd(), ".data");
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, "staging-workshop-registrations.jsonl");

async function readTestLogEntries(): Promise<WorkshopRegistrationRecord[]> {
  try {
    const contents = await readFile(TEST_LOG_FILE, "utf8");
    return contents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WorkshopRegistrationRecord);
  } catch {
    return [];
  }
}

// Best-effort capacity/waitlist check. Correct for a single dev/staging
// instance; a real production launch with genuinely high concurrent
// demand near capacity would need an atomic counter (e.g. a database
// transaction) to fully rule out a race condition where two
// near-simultaneous registrations both read "space available" — flagged
// here rather than silently assumed safe, same spirit as the rate
// limiter and idempotency store's documented caveats.
export async function countRegisteredForWorkshop(workshopSlug: string): Promise<number> {
  if (!productionSendingEnabled()) {
    const entries = await readTestLogEntries();
    return entries.filter(
      (e) => e.workshopSlug === workshopSlug && e.registrationStatus === "Registered"
    ).length;
  }
  return countByStatusInGoogleSheets(workshopSlug, "Registered");
}

// Needed so each new waitlisted registrant gets the *next* position
// (2, 3, 4…), not a position recomputed from the (by then static)
// registered count — see decideRegistrationStatus below.
export async function countWaitlistedForWorkshop(workshopSlug: string): Promise<number> {
  if (!productionSendingEnabled()) {
    const entries = await readTestLogEntries();
    return entries.filter(
      (e) => e.workshopSlug === workshopSlug && e.registrationStatus === "Waitlisted"
    ).length;
  }
  return countByStatusInGoogleSheets(workshopSlug, "Waitlisted");
}

async function countByStatusInGoogleSheets(
  workshopSlug: string,
  status: RegistrationStatus
): Promise<number> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!email || !privateKey || !spreadsheetId) return 0;

  try {
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Workshop Registrations!B:J",
    });
    const rows = res.data.values ?? [];
    return rows.filter((row) => row[0] === workshopSlug && row[8] === status).length;
  } catch (err) {
    console.error("[workshops] failed to read Google Sheet for capacity check", err);
    return 0;
  }
}

function toSheetRow(record: WorkshopRegistrationRecord): string[] {
  return [
    record.registrationReference,
    record.workshopSlug,
    record.workshopId,
    record.workshopTitle,
    record.fullName,
    record.email,
    record.phone,
    record.country ?? "",
    record.experienceLevel ?? "",
    record.registrationDate,
    record.registrationStatus,
    record.paymentStatus,
    "", // Amount Due — admin-filled once pricing is approved and confirmed per registrant
    "", // Amount Paid — admin-filled after manual payment confirmation
    record.waitingListPosition ? `Waiting (position ${record.waitingListPosition})` : "",
    "", // Attendance Status — admin-filled after the workshop
    record.registrationDate, // Consent Timestamp — captured at submission, same moment
    "", // Internal Notes — admin-filled
    record.environment,
  ];
}

async function saveToTestLog(record: WorkshopRegistrationRecord): Promise<SaveResult> {
  try {
    await mkdir(TEST_LOG_DIR, { recursive: true });
    await appendFile(TEST_LOG_FILE, JSON.stringify(record) + "\n", "utf8");
    return { ok: true, mode: "test-log" };
  } catch (err) {
    console.error("[workshops] failed to write staging test log", err);
    return { ok: false, error: "test-log-write-failed" };
  }
}

async function saveToGoogleSheets(record: WorkshopRegistrationRecord): Promise<SaveResult> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    console.error(
      "[workshops] production sending is enabled but Google Sheets credentials are missing — refusing to silently drop a real registration"
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
      range: "Workshop Registrations!A:S",
      valueInputOption: "RAW",
      requestBody: { values: [toSheetRow(record)] },
    });
    return { ok: true, mode: "google-sheets" };
  } catch (err) {
    console.error("[workshops] Google Sheets append failed", err);
    return { ok: false, error: "google-sheets-append-failed" };
  }
}

export async function saveRegistration(record: WorkshopRegistrationRecord): Promise<SaveResult> {
  if (!productionSendingEnabled()) {
    return saveToTestLog(record);
  }
  return saveToGoogleSheets(record);
}

export function decideRegistrationStatus(
  workshop: Workshop,
  currentRegisteredCount: number,
  currentWaitlistedCount: number
): { status: RegistrationStatus; waitingListPosition: number | null; paymentStatus: PaymentStatus } {
  const status: RegistrationStatus =
    currentRegisteredCount < workshop.capacity ? "Registered" : "Waitlisted";
  const waitingListPosition = status === "Waitlisted" ? currentWaitlistedCount + 1 : null;
  // Manual payment confirmation only (approved 2026-07-23) — no online
  // payment collection exists yet, so a workshop that requires payment
  // starts every registrant at "Pending" for an administrator to confirm
  // by hand; one that doesn't require payment skips straight to
  // "Not Required".
  const paymentStatus: PaymentStatus = workshop.requiresPayment ? "Pending" : "Not Required";
  return { status, waitingListPosition, paymentStatus };
}
