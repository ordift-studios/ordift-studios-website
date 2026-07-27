import { NextResponse } from "next/server";
import { requireSuperAdminApiUser } from "@/lib/admin/apiAuth";
import { getSheetsClient, getSpreadsheetId, isGoogleSheetsConfigured } from "@/lib/googleSheets/client";
import { WORKSHEET_REGISTRY } from "@/lib/googleSheets/registry";

// Super Admin-only, one-shot verification action — NOT part of any
// visitor-facing or even staff-facing path. Proves the full Google
// Sheets write path works for real (auth, spreadsheet lookup, write
// permission, read-back) by appending one clearly-labeled row to the
// live "Contact Enquiries" worksheet, reading it back to confirm it
// landed correctly, then deleting that exact row — so it never lingers
// as clutter in a worksheet real staff will later export/report on.
// See GOOGLE_SHEETS_INTEGRATION.md §10 for whether this route should
// stay in the codebase permanently or be removed after Phase 2.
const TARGET_WORKSHEET = "contactEnquiries" as const;

export async function POST() {
  const steps: Record<string, { ok: boolean; detail?: string }> = {};

  const user = await requireSuperAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ ok: false, error: "google-sheets-not-configured" }, { status: 503 });
  }

  const config = WORKSHEET_REGISTRY[TARGET_WORKSHEET];
  const spreadsheetId = getSpreadsheetId();
  const sheets = getSheetsClient();

  // 1. Authentication + spreadsheet lookup
  let sheetId: number | undefined;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    steps.authentication = { ok: true };
    steps.spreadsheetLookup = { ok: true, detail: meta.data.properties?.title ?? undefined };

    const existing = meta.data.sheets?.find((s) => s.properties?.title === config.tabName);
    if (!existing) {
      steps.worksheetExists = { ok: false, detail: `"${config.tabName}" tab not found` };
      return NextResponse.json({ ok: false, steps }, { status: 500 });
    }
    sheetId = existing.properties?.sheetId ?? undefined;
    steps.worksheetExists = { ok: true };
    steps.formatting = {
      ok: Boolean(existing.properties?.gridProperties?.frozenRowCount),
      detail: `frozenRowCount=${existing.properties?.gridProperties?.frozenRowCount ?? 0}`,
    };
  } catch (err) {
    steps.authentication = { ok: false, detail: err instanceof Error ? err.message : "unknown-error" };
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  // 2. Write a single, clearly-labeled QA verification row
  const now = new Date().toISOString();
  const qaRecordId = `QA-VERIFY-${Date.now()}`;
  const row: (string | number)[] = [
    now,
    qaRecordId,
    "Internal QA Verification",
    "QA TEST — AUTO-DELETED",
    "",
    "qa-verification",
    "QA VERIFICATION ROW — SAFE TO IGNORE",
    "",
    "qa-verification@ordiftstudios.internal",
    "",
    "",
    "",
    "",
    "",
    "",
    "Automated verification row written by /api/admin/google-sheets/verify-write. Confirms authentication, spreadsheet lookup, write permission, and read-back all succeed. Deleted immediately after read-back — if you're seeing this, automatic cleanup failed and it's safe to delete manually.",
    "",
    "",
    "",
    "",
    "Auto-generated, auto-deleted QA row — see GOOGLE_SHEETS_INTEGRATION.md",
    "",
    "",
    "No",
    now,
  ];

  let updatedRange: string | undefined;
  try {
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${config.tabName}!A:Y`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    updatedRange = appendResult.data.updates?.updatedRange ?? undefined;
    steps.writePermission = { ok: true, detail: updatedRange };
  } catch (err) {
    steps.writePermission = { ok: false, detail: err instanceof Error ? err.message : "unknown-error" };
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  // 3. Read the exact row back and confirm it matches what was sent
  let rowIndex: number | undefined;
  try {
    if (!updatedRange) throw new Error("append succeeded but returned no updatedRange");
    const match = /![A-Z]+(\d+):/.exec(updatedRange);
    if (!match) throw new Error(`could not parse row number from "${updatedRange}"`);
    rowIndex = Number(match[1]);

    const readBack = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${config.tabName}!A${rowIndex}:Y${rowIndex}`,
    });
    const readValues = readBack.data.values?.[0] ?? [];
    const matches = readValues[1] === qaRecordId;
    steps.readBackVerification = {
      ok: matches,
      detail: matches ? `confirmed Record ID ${qaRecordId} at row ${rowIndex}` : "row content did not match",
    };
  } catch (err) {
    steps.readBackVerification = { ok: false, detail: err instanceof Error ? err.message : "unknown-error" };
  }

  // 4. Clean up — delete the exact row just written, regardless of
  // whether read-back matched, so a failed verification never leaves
  // QA clutter behind either.
  try {
    if (sheetId !== undefined && rowIndex !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: rowIndex - 1,
                  endIndex: rowIndex,
                },
              },
            },
          ],
        },
      });
      steps.cleanup = { ok: true, detail: `deleted row ${rowIndex}` };
    } else {
      steps.cleanup = { ok: false, detail: "missing sheetId or rowIndex — manual cleanup needed" };
    }
  } catch (err) {
    steps.cleanup = { ok: false, detail: err instanceof Error ? err.message : "unknown-error" };
  }

  const allOk = Object.values(steps).every((s) => s.ok);
  return NextResponse.json({ ok: allOk, steps, verifiedBy: user.email, verifiedAt: now });
}
