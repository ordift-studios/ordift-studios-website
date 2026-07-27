import { createAdminClient } from "@/lib/supabase/admin";
import type { WorksheetKey } from "@/lib/googleSheets/registry";

// The resilience half of the dual-storage workflow: when a Google
// Sheets append fails after its Supabase primary write already
// succeeded, the failure is logged here instead of the row being
// silently dropped — see supabase/migrations/0013_record_ids_and_sheet_sync.sql
// for the sheet_sync_failures table this writes to.
//
// Deliberately best-effort itself: logging a failure must never throw
// or block the request that triggered it. If even this insert fails,
// the only fallback left is the server log line below — the
// already-saved Supabase record is never at risk either way.
export async function logSheetSyncFailure(params: {
  worksheetKey: WorksheetKey;
  recordId: string;
  rowData: unknown;
  errorMessage: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("sheet_sync_failures").insert({
      worksheet_key: params.worksheetKey,
      record_id: params.recordId,
      row_data: params.rowData,
      error_message: params.errorMessage,
    });
    if (error) {
      console.error("[sheetSyncFailures] failed to log sync failure", params.recordId, error.message);
    }
  } catch (err) {
    console.error("[sheetSyncFailures] threw while logging sync failure", params.recordId, err);
  }
}
