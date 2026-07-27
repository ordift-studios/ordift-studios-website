// One-time (and safely re-runnable) setup script that prepares every
// worksheet the dual-storage form workflow needs inside a single Google
// Spreadsheet named "Ordift Studios Operations" — see
// GOOGLE_SHEETS_INTEGRATION.md for the full setup walkthrough.
//
// What it does: for each worksheet in the registry
// (src/lib/googleSheets/registry.ts), creates the tab if it doesn't
// already exist, then writes/refreshes its header row. Idempotent —
// re-running after a registry change (e.g. a new column) is safe and
// brings every tab's header up to date without touching data rows.
//
// Usage (after creating the service account, the spreadsheet, and
// sharing it with the service account's email as Editor):
//   npx tsx scripts/setupGoogleSheets.ts
//
// Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
// and GOOGLE_SHEETS_SPREADSHEET_ID set in .env.local (or the shell
// environment). Never commit real values for these.

import { ensureAllWorksheets } from "@/lib/googleSheets/ensureWorksheets";
import { WORKSHEET_REGISTRY } from "@/lib/googleSheets/registry";

async function main() {
  console.log("Preparing the \"Ordift Studios Operations\" spreadsheet...\n");

  const results = await ensureAllWorksheets();

  for (const result of results) {
    console.log(`  ${result.created ? "created" : "already existed"} — ${result.tabName}`);
  }

  console.log("\nAll worksheets prepared. Live (currently written to by a form):");
  for (const config of Object.values(WORKSHEET_REGISTRY)) {
    if (config.live) console.log(`  - ${config.tabName}`);
  }
  console.log("\nReserved (structure ready, no form writes to it yet):");
  for (const config of Object.values(WORKSHEET_REGISTRY)) {
    if (!config.live) console.log(`  - ${config.tabName}`);
  }
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
