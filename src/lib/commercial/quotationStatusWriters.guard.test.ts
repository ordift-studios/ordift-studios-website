import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Issuing an ordinary quotation must be ONE audited, confirmed act (quotationIssuance.ts). This test scans every application source file so that no other code path can ever
// set a quotation to "sent" (the legacy "Mark Sent" route, a new server action, a script) without it being noticed here.
const SRC = join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.(test|e2e|testkit)\.|\.localdb\./.test(f)) out.push(p);
  }
  return out;
}
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const files = walk(SRC).map((p) => ({ p: p.slice(SRC.length + 1), src: code(readFileSync(p, "utf8")) }));

describe("only two writers may set status 'sent' on a quotation: the atomic issuing function (ordinary) and Crew Support's own path", () => {
  const writers = files.filter((f) => /client_quotations/.test(f.src) && /status:\s*"sent"/.test(f.src)).map((f) => f.p).sort();
  it("the complete list of application files: only Crew Support's own issue/restore path (ordinary issuance is the database function, called by quotationIssuance.ts)", () => {
    expect(writers).toEqual(["lib/crewSupport/quotation.ts"]);
    const iss = files.find((x) => x.p === "lib/commercial/quotationIssuance.ts")!.src;
    expect(iss).toContain('rpc("issue_ordinary_quotation"');
  });
  it("the generic status change cannot write 'sent': it delegates to issuance before any write", () => {
    const f = files.find((x) => x.p === "lib/commercial/clientQuotations.ts")!.src;
    const body = f.slice(f.indexOf("export async function updateQuotationStatus"), f.indexOf("export async function associateProspectQuotationWithClient"));
    expect(body).not.toMatch(/status:\s*"sent"/);
    expect(body.indexOf('params.status === "sent"')).toBeGreaterThan(-1);
    expect(body.indexOf('params.status === "sent"')).toBeLessThan(body.indexOf(".update("));
    expect(body.indexOf('params.status === "accepted"')).toBeLessThan(body.indexOf(".update("));       // acceptance is never a bare flip either
  });
  it("Crew Support's quotation functions only ever load Crew quotations, and ordinary issuance refuses them", () => {
    const crew = files.find((x) => x.p === "lib/crewSupport/quotation.ts")!.src;
    expect(crew).toMatch(/async function adminQuotationById[\s\S]{0,300}\.not\("crew_support_request_id", "is", null\)/);
    const iss = files.find((x) => x.p === "lib/commercial/quotationIssuance.ts")!.src;
    expect(iss).toContain("crewManaged: Boolean(q.crew_support_request_id)");
  });
  it("no migration sets a quotation to 'sent' except the one atomic ordinary-issuance function", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const hits = readdirSync(dir).filter((f) => f.endsWith(".sql")).filter((f) => /update\s+public\.client_quotations\s+set[^;]*status\s*=\s*'sent'/i.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual(["0172_atomic_ordinary_quotation_issuance.sql"]);
    const sql = readFileSync(join(dir, hits[0]), "utf8");
    expect((sql.match(/status\s*=\s*'sent'/g) ?? []).length).toBe(1);
    expect(sql.slice(sql.indexOf("create or replace function public.issue_ordinary_quotation"), sql.indexOf("revoke all on function public.issue_ordinary_quotation"))).toContain("status = 'sent'");
  });
});
