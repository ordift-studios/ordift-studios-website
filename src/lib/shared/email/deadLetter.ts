import { createAdminClient } from "@/lib/supabase/admin";

// The resilience half of the email send workflow: when sendEmailNow()
// exhausts its retries (or fails permanently), the failure is logged
// here instead of only existing as a server log line — mirrors
// src/lib/shared/sheetSyncFailures.ts for Google Sheets; see
// supabase/migrations/0022_email_send_failures.sql for the table.
//
// Deliberately best-effort itself: logging a failure must never throw
// or block the request that triggered the send. If even this insert
// fails, the only fallback left is the server log line already
// written by dispatch.ts.
export async function logEmailSendFailure(params: {
  emailType: string;
  recipient: string;
  referenceNumber: string | null;
  errorMessage: string;
  attempts: number;
  permanent: boolean;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("email_send_failures").insert({
      email_type: params.emailType,
      recipient: params.recipient,
      reference_number: params.referenceNumber,
      error_message: params.errorMessage,
      attempts: params.attempts,
      permanent: params.permanent,
    });
    if (error) {
      console.error("[emailDeadLetter] failed to log send failure", params.emailType, error.message);
    }
  } catch (err) {
    console.error("[emailDeadLetter] threw while logging send failure", params.emailType, err);
  }
}
