import { google, type sheets_v4 } from "googleapis";

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

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}
