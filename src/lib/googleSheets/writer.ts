import { getSheetsClient, getSpreadsheetId, isGoogleSheetsConfigured } from "./client";
import { WORKSHEET_REGISTRY, type WorksheetKey } from "./registry";

export type AppendResult = { ok: true } | { ok: false; error: string };

// The one reusable write path every form's Sheets sync goes through
// (see src/lib/enquiry/storage.ts's syncEnquiryToSheets and
// src/lib/workshops/registrationStorage.ts's syncRegistrationToSheets
// for the two current callers). Never throws — always resolves to a
// result the caller can log-and-continue on, since Google Sheets is now
// the best-effort secondary copy, not the primary write (see
// src/lib/supabase/primaryWrite.ts).
export async function appendToWorksheet(
  worksheetKey: WorksheetKey,
  row: (string | number)[]
): Promise<AppendResult> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: false, error: "google-sheets-not-configured" };
  }

  const config = WORKSHEET_REGISTRY[worksheetKey];

  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: `${config.tabName}!A:Z`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return { ok: true };
  } catch (err) {
    console.error(`[googleSheets] append to "${config.tabName}" failed`, err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown-error" };
  }
}
