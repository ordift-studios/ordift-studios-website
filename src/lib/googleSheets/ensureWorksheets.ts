import { getSheetsClient, getSpreadsheetId, isGoogleSheetsConfigured } from "./client";
import { WORKSHEET_REGISTRY, type WorksheetKey } from "./registry";

export type EnsureWorksheetResult = { tabName: string; created: boolean };

// Idempotent: safe to run repeatedly. Creates the worksheet tab if it
// doesn't exist yet, then (re)writes row 1 with the current header row —
// so re-running after a registry change (e.g. a new column) brings an
// already-created tab's header up to date without touching any data
// rows beneath it. Used by scripts/setupGoogleSheets.ts; not called from
// any request path.
export async function ensureWorksheet(key: WorksheetKey): Promise<EnsureWorksheetResult> {
  if (!isGoogleSheetsConfigured()) {
    throw new Error(
      "Google Sheets is not configured — set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID first."
    );
  }

  const config = WORKSHEET_REGISTRY[key];
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((sheet) => sheet.properties?.title === config.tabName);

  let created = false;
  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: config.tabName } } }] },
    });
    created = true;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${config.tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [config.headerRow] },
  });

  return { tabName: config.tabName, created };
}

export async function ensureAllWorksheets(): Promise<EnsureWorksheetResult[]> {
  const results: EnsureWorksheetResult[] = [];
  // Sequential, not Promise.all — batchUpdate calls against the same
  // spreadsheet are safest run one at a time rather than racing several
  // addSheet requests concurrently.
  for (const key of Object.keys(WORKSHEET_REGISTRY) as WorksheetKey[]) {
    results.push(await ensureWorksheet(key));
  }
  return results;
}
