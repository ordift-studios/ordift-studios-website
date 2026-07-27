import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/apiAuth";
import { isGoogleSheetsConfigured, getSheetsClient, getSpreadsheetId } from "@/lib/googleSheets/client";
import { ensureAllWorksheets } from "@/lib/googleSheets/ensureWorksheets";

// Admin-only trigger for the same worksheet bootstrap
// scripts/setupGoogleSheets.ts performs locally — needed because
// Vercel's "Sensitive" environment variables can be used by a running
// deployment but never read back by anyone, including via the CLI, so
// this is the only way to run the bootstrap against production without
// the credentials ever passing through a human's hands. Never returns
// or logs the credential values themselves — only tab names, booleans,
// and Google API error messages (which describe *why* auth failed, not
// the key itself).

export async function GET() {
  const user = await requireAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const envPresence = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    GOOGLE_SHEETS_SPREADSHEET_ID: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
  };

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ ok: false, configured: false, envPresence });
  }

  try {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
    return NextResponse.json({
      ok: true,
      configured: true,
      envPresence,
      connectivity: "authenticated successfully",
      spreadsheetTitle: meta.data.properties?.title ?? null,
      existingTabs: (meta.data.sheets ?? []).map((s) => s.properties?.title),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      configured: true,
      envPresence,
      connectivity: "authentication or API call failed",
      error: err instanceof Error ? err.message : "unknown-error",
    });
  }
}

export async function POST() {
  const user = await requireAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ ok: false, error: "google-sheets-not-configured" }, { status: 503 });
  }

  try {
    const results = await ensureAllWorksheets();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown-error" },
      { status: 500 }
    );
  }
}
