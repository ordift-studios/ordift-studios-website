// LOCAL tool: dry-runs a "record sheet" (the exact entries to type into the Equipment & Financing panel) through the SAME form parser and validator the panel uses.
// The sheet lives OUTSIDE the repository (real supplier/invoice details never go into this public repo). Writes nothing, connects to nothing, creates no record.
// Usage: npx tsx scripts/finance_validate_record_sheet.ts <sheet.json>      Values written like "<shown after upload>" are replaced by a dummy UUID for the dry run only.
import { readFileSync } from "node:fs";
import { parseAcquisitionForm } from "../src/lib/organization/equipmentForms";
import { validateAcquisition } from "../src/lib/organization/equipmentFinancingRules";

const path = process.argv[2];
if (!path) { console.error("usage: finance_validate_record_sheet.ts <sheet.json>"); process.exit(2); }
const sheet = JSON.parse(readFileSync(path, "utf8")).fields as Record<string, string>;
const dummy = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
let n = 0;
const fields = Object.fromEntries(Object.entries(sheet).map(([k, v]) => [k, /^<.*>$/.test(v) ? (/DocumentId$|^entityId$/.test(k) ? dummy(++n) : "") : v]));
const parsed = parseAcquisitionForm({ get: (k: string) => fields[k] });
if (!parsed.ok) { console.log("REFUSED by the form parser:", parsed.error); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const v = validateAcquisition(parsed.acquisition, parsed.financing, today);
if (!v.ok) { console.log("REFUSED by the validator:", v.error); process.exit(1); }
const f = v.payload.financing;
console.log("VALID — the panel would accept these entries (nothing was recorded).");
console.log(`  purchase: ${v.payload.acquisition.supplier} · invoice ${v.payload.acquisition.invoiceNumber} · ${v.payload.acquisition.purchaseDate} · net ${v.payload.acquisition.net} ${v.payload.acquisition.currency} (list ${v.payload.acquisition.listPrice} − discount ${v.payload.acquisition.discount})`);
console.log(`  funding: ${v.payload.acquisition.fundingStatus} (note present: ${Boolean(v.payload.acquisition.fundingNote)}) · accounting classification: pending_professional_review (fixed at entry)`);
if (f) {
  console.log(`  financing: ${f.provider} ${f.reference} · ${f.instalments.length} instalments · schedule basis ${f.scheduleBasis}`);
  for (const i of f.instalments) console.log(`    #${i.sequence} ${i.amount.toFixed(2)} ${i.expectedMonth.slice(0, 7)}${i.sequence === 1 && v.payload.firstInstalmentPaid ? ` — REPORTED PAID ${v.payload.firstInstalmentPaid.paidOn} (awaiting statement)` : " — pending"}`);
  console.log(`  total of instalments: ${f.instalments.reduce((s, i) => s + i.amount, 0).toFixed(2)}`);
}
