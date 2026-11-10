// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-level guards for the Equipment & Financing release: the panel and its libraries can only (1) call the two audited database functions,
// (2) never create an accounting expense, (3) never write statement/bank evidence, and (4) never import the statement-matching engine into a write path.
const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
// code only: comments may legitimately say "no expense, no journal"
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const PANEL = "src/app/admin/organization/legal-entities/[entityId]/equipment";
const writeFiles = ["src/lib/organization/equipmentFinancing.ts", "src/lib/organization/equipmentForms.ts", "src/lib/organization/equipmentFinancingRules.ts", "src/lib/organization/equipmentPanelView.ts", `${PANEL}/actions.ts`, `${PANEL}/page.tsx`, `${PANEL}/EquipmentPanel.tsx`];
const pure = ["src/lib/organization/financePosition.ts", "src/lib/organization/statementReconciliation.ts", "src/lib/organization/equipmentPanelView.ts", "src/lib/organization/equipmentForms.ts", "src/lib/organization/equipmentFinancingRules.ts"];

describe("equipment & financing isolation", () => {
  it("writes to the database ONLY through the audited functions (no direct insert/update/upsert/delete)", () => {
    for (const f of writeFiles) expect(read(f), f).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    const lib = read("src/lib/organization/equipmentFinancing.ts");
    expect([...lib.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort()).toEqual(["mark_instalment_paid", "record_acquisition_payment", "record_equipment_acquisition", "set_acquisition_terms", "void_acquisition_payment"]);
  });
  it("never creates or references an accounting expense, journal or payment record", () => {
    for (const f of [...writeFiles, ...pure]) expect(code(f), f).not.toMatch(/entity_expenses|recordEntityReceipt|payment_obligations|\.from\("payments"\)|journal_entries|ledger_entries/i);
  });
  it("never writes statement / bank evidence: no form, action, rule or screen mentions it, and the library only reads it", () => {
    for (const f of [`${PANEL}/actions.ts`, `${PANEL}/EquipmentPanel.tsx`, `${PANEL}/page.tsx`, "src/lib/organization/equipmentForms.ts", "src/lib/organization/equipmentFinancingRules.ts"]) expect(code(f), f).not.toMatch(/bank_evidence|statementEvidence|statement_verified/);
    const lib = code("src/lib/organization/equipmentFinancing.ts");
    for (const line of lib.split("\n").filter((l) => /bank_evidence/.test(l))) expect(line.slice(0, 90)).toMatch(/\.select\(/);
    expect(lib).not.toMatch(/rpc\([^)]*bank_evidence/);
  });
  it("the statement-matching engine is not imported by any write path or by the panel", () => {
    for (const f of writeFiles) expect(read(f), f).not.toMatch(/statementReconciliation/);
  });
  it("the pure libraries import no database, filesystem, network or framework code", () => {
    for (const f of pure) expect(read(f), f).not.toMatch(/from "(@\/lib\/supabase|node:|next\/|react|fs|child_process)/);
  });
  it("every entry point checks Super Admin", () => {
    expect(read(`${PANEL}/page.tsx`)).toMatch(/isSuperAdmin\(user\)/);
    expect(read(`${PANEL}/actions.ts`)).toMatch(/isSuperAdmin\(u\)/);
    const lib = read("src/lib/organization/equipmentFinancing.ts");
    expect((lib.match(/isSuperAdminId\(/g) ?? []).length).toBeGreaterThanOrEqual(3);   // record, mark paid, load
  });
  it("the overlap check only READS (no insert/update/upsert/delete/rpc) and is the only equipment-side code that mentions expenses", () => {
    expect(code("src/lib/organization/financeOverlap.ts")).not.toMatch(/\.(insert|update|upsert|delete|rpc)\s*\(/);
  });
});
