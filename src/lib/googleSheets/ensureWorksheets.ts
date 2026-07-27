import { getSheetsClient, getSpreadsheetId, isGoogleSheetsConfigured } from "./client";
import { WORKSHEET_REGISTRY, type WorksheetKey } from "./registry";

export type EnsureWorksheetResult = { tabName: string; created: boolean };

// Idempotent: safe to run repeatedly. Creates the worksheet tab if it
// doesn't exist yet, (re)writes row 1 with the current header row, and
// (re)applies the standard operational formatting — bold navy header,
// frozen header row, a basic filter across the header, and readable
// auto-sized column widths — so re-running after a registry change
// (e.g. a new column) brings an already-created tab fully up to date
// without touching any data rows beneath it. Used by
// scripts/setupGoogleSheets.ts and the admin-triggered
// /api/admin/google-sheets/setup route; not called from any public
// request path.
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
  let sheetId = existing?.properties?.sheetId;

  if (!existing) {
    const addResult = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: config.tabName } } }] },
    });
    sheetId = addResult.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
    created = true;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${config.tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [config.headerRow] },
  });

  if (sheetId !== undefined && sheetId !== null) {
    const columnCount = config.headerRow.length;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Bold white-on-navy header row, matching the site's brand navy.
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  backgroundColor: { red: 0.043, green: 0.071, blue: 0.125 },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          // Freeze the header row so it stays visible while scrolling.
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          // A basic filter across the header row — gives every tab
          // sort/filter dropdowns without anyone having to add them by
          // hand.
          {
            setBasicFilter: {
              filter: { range: { sheetId, startRowIndex: 0, endColumnIndex: columnCount } },
            },
          },
          // Auto-size every column to its content for readability —
          // re-running this after new rows exist keeps widths sane
          // rather than leaving them at Sheets' narrow default.
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount },
            },
          },
        ],
      },
    });
  }

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
