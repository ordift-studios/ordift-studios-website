// Imports ONLY the Sheets module, not the whole "googleapis" package. The package root pulls in the type definitions of every Google API (about 3.4 million lines, 917 files: 90% of everything
// the TypeScript compiler loads for this project), which made the production build's type-check hold roughly 3 GB more than it needs. Same package, same version, same runtime behaviour for Sheets
// (the Sheets module is what `google.sheets` and `google.auth` resolve to); nothing is type-checked less.
import { auth as googleAuth, sheets, type sheets_v4 } from "googleapis/build/src/apis/sheets";

// Shared JWT-authenticated Sheets API client — the one place that knows
// how to authenticate with Google, used by every worksheet writer
// (src/lib/googleSheets/writer.ts) and the setup script
// (scripts/setupGoogleSheets.ts). Replaces the two duplicated
// google.auth.JWT setups that used to live in src/lib/enquiry/storage.ts
// and src/lib/workshops/registrationStorage.ts.

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  );
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set");
  return id;
}

let cachedClient: sheets_v4.Sheets | null = null;

export function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("Google Sheets service account credentials are not set");
  }

  const auth = new googleAuth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = sheets({ version: "v4", auth });
  return cachedClient;
}
