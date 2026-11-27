import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

// The "googleapis" package root pulls in the type definitions of every Google API (about 3.4 million lines, 917 files: roughly 90% of everything TypeScript loads for this project). That made the
// production build's type-check hold ~1.1 GB more than necessary and was the main contributor to the intermittent out-of-memory / hang failures of the Vercel build. Only the Sheets module is needed.
describe("googleapis is imported narrowly", () => {
  it("no source file imports the package root (only googleapis/build/src/apis/sheets)", () => {
    const out = execSync(`git grep -nE "from ['\\"]googleapis['\\"]|require\\(['\\"]googleapis['\\"]\\)" -- src scripts ':!*.test.ts' || true`, { cwd: process.cwd() }).toString().trim().split("\n").filter(Boolean);
    expect(out).toEqual([]);
  }, 30000);
});

describe("the Sheets client still builds with the narrow import", () => {
  it("constructs a Sheets client from service-account settings without any network call", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n";
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-id-for-test";
    const { getSheetsClient, isGoogleSheetsConfigured } = await import("./client");
    expect(isGoogleSheetsConfigured()).toBe(true);
    const c = getSheetsClient();
    expect(typeof c.spreadsheets.values.append).toBe("function");
    expect(typeof c.spreadsheets.get).toBe("function");
    expect(getSheetsClient()).toBe(c);   // cached
  });
});
