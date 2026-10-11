import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Production's service_role has NO grant on these reference tables (migration 0024 granted them to
// `authenticated` only), so the admin/service-role client can never read or write them — it fails with
// "permission denied", which surfaced as "QAR isn't a supported currency" when saving a bank account.
// A local database with default privileges hides the problem, so guard it statically.
const GRANTLESS = ["currencies", "payment_country_config", "exchange_rates", "current_exchange_rates"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|e2e)\./.test(name)) out.push(p);
  }
  return out;
}

describe("reference tables are accessed with the session client, not the admin client", () => {
  const files = [...walk("src/lib/payments"), ...walk("src/app/api/payments"), ...walk("src/app/admin/payments"), ...walk("src/app/admin/enquiries")];

  it("no file reads or writes a grant-less reference table through an admin-client variable", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      for (const t of GRANTLESS) {
        // admin.from("t") / createAdminClient().from("t") / supabase = createAdminClient() style handled below
        if (new RegExp(`(admin|createAdminClient\\(\\))\\s*\\.from\\(\\s*["']${t}["']`).test(src)) offenders.push(`${f}: ${t}`);
        if (new RegExp(`(admin|createAdminClient\\(\\))\\s*\\n\\s*\\.from\\(\\s*["']${t}["']`).test(src)) offenders.push(`${f}: ${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the bank-account save path validates the currency with the session client and reports a lookup failure honestly", () => {
    const src = readFileSync("src/lib/payments/bankAccountsAdmin.ts", "utf8");
    expect(src).toMatch(/session\.from\("currencies"\)/);
    expect(src).toContain("Couldn't check the currency right now. Nothing was saved");
    expect(src).toContain("isn't a supported currency");
  });

  it("failures are logged by error code only — never account numbers, IBANs or holder names", () => {
    const src = readFileSync("src/lib/payments/bankAccountsAdmin.ts", "utf8");
    const logs = [...src.matchAll(/console\.error\(([^;]*)\);/g)].map((m) => m[1]);
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) expect(l).not.toMatch(/iban|accountNumber|account_number|beneficiary|input\b|i\./i);
  });

  it("the Qatar instruction route reads market config and the exchange rate with the client's session", () => {
    const route = readFileSync("src/app/api/payments/bank-transfer/proof/route.ts", "utf8");
    expect(route).toMatch(/session\s*\n?\s*\.from\("payment_country_config"\)/);
    expect(route).toMatch(/session\s*\n?\s*\.from\("current_exchange_rates"\)/);
  });
});
