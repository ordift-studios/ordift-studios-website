import { afterAll, describe, expect, it } from "vitest";
import { appendToWorksheet } from "./writer";
import { isGoogleSheetsConfigured, getSheetsClient, getSpreadsheetId } from "./client";
import { WORKSHEET_REGISTRY } from "./registry";
import { logSheetSyncFailure } from "@/lib/shared/sheetSyncFailures";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// Two things are real dependencies worth real tests (TDR-003): the
// Sheets write path itself, and the dead-letter resilience path when a
// sync fails. Per INTEGRATION_TESTING_STRATEGY.md §2/§5: mindful of
// Google's 300 req/min quota (comfortably fine for this handful of
// calls), and per your instruction not to create unnecessary
// production data or touch a live worksheet — this suite deliberately
// targets `clientBookings`, a worksheet that already exists in the
// real staging spreadsheet (created by scripts/setupGoogleSheets.ts)
// but is marked `live: false`: nothing in the app writes to it today,
// so it's the one tab a test can safely use without risking collision
// with real staging submissions or needing to create new spreadsheet
// structure.

const runId = testRunId();
const testRecordId = `TEST-${runId}`;
const admin = createTestAdminClient();

describe("Google Sheets sync — real write + independently verified cleanup", () => {
  // Skips rather than fails when Sheets credentials aren't present in
  // whatever environment runs this — per the "don't consume avoidable
  // third-party quota" rule, no point failing loudly over missing
  // optional config in, say, a contributor's local machine.
  const sheetsReady = isGoogleSheetsConfigured();

  it.skipIf(!sheetsReady)("appends a TEST-marked row to the unused clientBookings worksheet", async () => {
    const row = [
      new Date().toISOString(),
      testRecordId,
      "integration-test",
      "test",
      "",
      `TEST client ${runId}`,
      "",
      testRecordId + "@ordiftstudios.invalid",
      "",
      "",
      "",
      "",
      "integration test row — safe to delete",
      new Date().toISOString(),
    ];
    expect(row).toHaveLength(WORKSHEET_REGISTRY.clientBookings.headerRow.length);

    const result = await appendToWorksheet("clientBookings", row);
    expect(result.ok).toBe(true);
  });

  it.skipIf(!sheetsReady)("the written row is actually readable back from the real spreadsheet", async () => {
    const sheets = getSheetsClient();
    const tabName = WORKSHEET_REGISTRY.clientBookings.tabName;
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${tabName}'!A:N`,
    });

    const rows = data.values ?? [];
    const matchIndex = rows.findIndex((r) => r[1] === testRecordId);
    expect(matchIndex).toBeGreaterThan(-1);
  });

  afterAll(async () => {
    if (!sheetsReady) return;
    // Find and delete exactly the row(s) carrying this run's marker —
    // never a broad "clear everything," per the cleanup discipline in
    // INTEGRATION_TESTING_STRATEGY.md §4.
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const tabName = WORKSHEET_REGISTRY.clientBookings.tabName;

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = meta.data.sheets?.find((s) => s.properties?.title === tabName)?.properties?.sheetId;

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:N`,
    });
    const rows = data.values ?? [];
    const matchRowIndices = rows
      .map((r, i) => (r[1] === testRecordId ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => b - a); // delete bottom-up so earlier indices stay valid

    if (matchRowIndices.length === 0 || sheetId === undefined) {
      if (matchRowIndices.length > 0) {
        console.error(
          `[sheetsSync.integration] CLEANUP FAILED for run ${runId} — could not resolve sheetId for tab "${tabName}". ` +
            `Orphaned row(s) at index ${matchRowIndices.join(",")} remain — log to TECHNICAL_DEBT_REGISTER.md.`
        );
      }
      return;
    }

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: matchRowIndices.map((rowIndex) => ({
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
            },
          })),
        },
      });
    } catch (err) {
      console.error(
        `[sheetsSync.integration] CLEANUP FAILED for run ${runId} — batchUpdate delete threw. ` +
          `Orphaned row(s) remain in "${tabName}" — log to TECHNICAL_DEBT_REGISTER.md.`,
        err
      );
    }
  });
});

describe("Google Sheets sync failure — dead-letter resilience (Supabase only, no real Sheets call)", () => {
  const failureRecordId = `TEST-fail-${runId}`;

  it("logSheetSyncFailure writes a queryable row to sheet_sync_failures", async () => {
    await logSheetSyncFailure({
      worksheetKey: "contactEnquiries",
      recordId: failureRecordId,
      rowData: { note: "integration test — simulated failure, safe to delete" },
      errorMessage: "simulated failure from sheetsSync.integration.test.ts",
    });

    const { data, error } = await admin.from("sheet_sync_failures").select("id, record_id, error_message").eq("record_id", failureRecordId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].error_message).toContain("simulated failure");
  });

  afterAll(async () => {
    const { error } = await admin.from("sheet_sync_failures").delete().eq("record_id", failureRecordId);
    if (error) {
      console.error(
        `[sheetsSync.integration] CLEANUP FAILED for run ${runId} — could not delete sheet_sync_failures row ` +
          `record_id=${failureRecordId}: ${error.message}. Log to TECHNICAL_DEBT_REGISTER.md.`
      );
    }
  });
});
