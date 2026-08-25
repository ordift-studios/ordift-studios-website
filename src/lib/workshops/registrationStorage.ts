import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { productionSendingEnabled } from "@/lib/shared/env";
import { appendToWorksheet } from "@/lib/googleSheets/writer";
import { logSheetSyncFailure } from "@/lib/shared/sheetSyncFailures";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // Workshop Management V1, Phase B (2026-08-25) — server-resolved, USD
  // reference amount from the selected ticket type (never a
  // client-supplied value). Null when no ticket type was selected or
  // the workshop has none configured — amount_due then stays exactly as
  // it always has (unset/null on the registration row).
  amountDueUsd: number | null;
  // Closure refinement (2026-08-25) — the Supabase workshop_registrations.id
  // (uuid), set only after a successful save. Lets the acknowledgement
  // email link a paying registrant straight into the existing portal
  // payment workspace via /portal/login?next=... — never a client-
  // supplied value, always the row this exact save just produced.
  registrationId: string | null;
};

// Workshop Management V1, Phase B (2026-08-25) — firstName/middleName/
// surname replaced the single fullName field; this is the one shared
// place that joins them back into a display string, used by both the
// Sheets sync row builder below and the email templates.
export function fullNameOf(record: Pick<WorkshopRegistrationRecord, "firstName" | "middleName" | "surname">): string {
  return [record.firstName, record.middleName, record.surname].filter(Boolean).join(" ");
}

// Deliberately separate from the enquiry test log — Workshop
// Registrations is a structurally distinct dataset, not a variant of
// Enquiries. Purely a secondary audit trail now (see header note in
// syncRegistrationToSheets below); never read for capacity/waitlist
// decisions.
const TEST_LOG_DIR = path.join(process.cwd(), ".data");
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, "staging-workshop-registrations.jsonl");

// Capacity/waitlist counts read from Supabase (2026-07-27) — the
// primary, authoritative record (src/lib/supabase/primaryWrite.ts) in
// both staging and production — rather than Google Sheets or the local
// test log. Still a best-effort read-then-decide, same documented
// caveat as before: a real production launch with high concurrent
// demand right at capacity would need a DB-level lock/transaction to
// fully rule out a race between two near-simultaneous registrations.
async function countByStatusInSupabase(
  workshopSlug: string,
  status: RegistrationStatus
): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("workshop_registrations")
      .select("id", { count: "exact", head: true })
      .eq("workshop_slug", workshopSlug)
      .eq("registration_status", status);
    if (error) {
      console.error("[workshops] failed to count registrations in Supabase", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[workshops] threw while counting registrations in Supabase", err);
    return 0;
  }
}

export async function countRegisteredForWorkshop(workshopSlug: string): Promise<number> {
  return countByStatusInSupabase(workshopSlug, "Registered");
}

export async function countWaitlistedForWorkshop(workshopSlug: string): Promise<number> {
  return countByStatusInSupabase(workshopSlug, "Waitlisted");
}

// Column order matches the "Workshop Registrations" worksheet config in
// src/lib/googleSheets/registry.ts — keep both in sync.
function toSheetRow(record: WorkshopRegistrationRecord): (string | number)[] {
  return [
    record.registrationDate,
    record.registrationReference,
    "Website Form",
    record.registrationStatus,
    "", // Assigned Staff (admin-filled)
    record.workshopTitle,
    record.workshopSlug,
    fullNameOf(record),
    record.email,
    record.phone,
    record.country ?? "",
    record.experienceLevel ?? "",
    record.waitingListPosition ? `Waiting (position ${record.waitingListPosition})` : "",
    record.paymentStatus,
    "", // Amount Due — admin-filled once pricing is approved and confirmed per registrant
    "", // Amount Paid — admin-filled after manual payment confirmation
    "", // Attendance Status — admin-filled after the workshop
    record.registrationDate, // Consent Timestamp — captured at submission
    "", // Internal Notes — admin-filled
    record.environment,
    record.registrationDate, // Last Updated
  ];
}

async function appendToTestLog(record: WorkshopRegistrationRecord): Promise<void> {
  try {
    await mkdir(TEST_LOG_DIR, { recursive: true });
    await appendFile(TEST_LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[workshops] failed to write staging test log", err);
  }
}

// Best-effort secondary copy (2026-07-27: Supabase is now primary — see
// src/lib/supabase/primaryWrite.ts). Never throws and never fails the
// caller: a failed Sheets append is logged to sheet_sync_failures for
// later retry instead of blocking or losing the already-saved
// registration. Same pattern as src/lib/enquiry/storage.ts's
// syncEnquiryToSheets.
export async function syncRegistrationToSheets(record: WorkshopRegistrationRecord): Promise<void> {
  if (!productionSendingEnabled()) {
    await appendToTestLog(record);
    return;
  }

  const result = await appendToWorksheet("workshopRegistrations", toSheetRow(record));
  if (!result.ok) {
    await logSheetSyncFailure({
      worksheetKey: "workshopRegistrations",
      recordId: record.registrationReference,
      rowData: toSheetRow(record),
      errorMessage: result.error,
    });
  }
}

// Workshop Management V1, Phase C (2026-08-25) — the registered/
// waitlisted capacity decision moved into create_workshop_registration()
// (supabase/migrations/0048), an atomic Postgres function, closing the
// count-then-insert race this function previously left open (see that
// migration's own comment). Only the payment-status decision — which
// never depended on capacity or concurrency — remains here.
export function decideWorkshopPaymentStatus(workshop: Workshop): PaymentStatus {
  // Manual payment confirmation only — no online payment collection
  // exists yet, so a workshop that requires payment starts every
  // registrant at "Pending" for an administrator to confirm by hand;
  // one that doesn't require payment skips straight to "Not Required".
  return workshop.requiresPayment ? "Pending" : "Not Required";
}
