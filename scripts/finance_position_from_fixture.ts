// LOCAL tool: prints the finance position and the statement-matching view for a fixture JSON file that lives OUTSIDE the repository
// (real supplier/invoice details never go into this public repo). Usage: npx tsx scripts/finance_position_from_fixture.ts <fixture.json>
// Reads only the file it is given. Writes nothing. Connects to nothing.
import { readFileSync } from "node:fs";
import { financeReport, customerMatch, type AcquisitionFact } from "../src/lib/organization/financePosition";
import { proposeMatches, type Expectation, type StatementLine, type StatementCoverage } from "../src/lib/organization/statementReconciliation";

type Fixture = { entityLegalName: string; acquisitions: (Omit<AcquisitionFact, "customerMatch"> & { customerAsShown: string | null; label: string })[]; statementLines?: StatementLine[]; statementCoverage?: StatementCoverage[]; expectations?: Expectation[] };
const path = process.argv[2];
if (!path) { console.error("usage: finance_position_from_fixture.ts <fixture.json>"); process.exit(2); }
const f = JSON.parse(readFileSync(path, "utf8")) as Fixture;
const acqs: AcquisitionFact[] = f.acquisitions.map((a) => ({ ...a, customerMatch: customerMatch(a.customerAsShown, f.entityLegalName) }));
const r = financeReport(acqs);
for (const p of r.perAcquisition) { const a = f.acquisitions.find((x) => x.id === p.acquisitionId)!; console.log(`\n${a.label}\n  purchase net ${p.purchaseNet.toFixed(2)} ${p.currency} | financed ${p.financed.toFixed(2)} | paid ${p.paidTotal.toFixed(2)} (verified by statement ${p.paidVerifiedByStatement.toFixed(2)}, awaiting statement ${p.paidAwaitingStatement.toFixed(2)}) | outstanding liability ${p.outstandingLiability.toFixed(2)} | expense recognised ${p.expenseRecognised}`); console.log("  open items: " + (p.flags.join(", ") || "none")); }
console.log("\nTotals by currency:", JSON.stringify(r.totalsByCurrency));
const m = proposeMatches(f.expectations ?? [], f.statementLines ?? [], f.statementCoverage ?? []);
console.log("\nStatement matching (proposals only; nothing is verified until a person confirms):");
for (const p of m.proposals) console.log(`  ${p.expectationKey}: ${p.status}${p.lineIds.length ? " -> " + p.lineIds.join(",") : ""} — ${p.note}`);
if (m.unmatchedLines.length) console.log("  unexpected statement lines:", m.unmatchedLines.map((l) => l.id).join(", "));
