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

describe("only two modules may write status 'sent' on a quotation, and neither can issue another's kind", () => {
  const writers = files.filter((f) => /client_quotations/.test(f.src) && /status:\s*"sent"/.test(f.src)).map((f) => f.p).sort();
  it("the complete list: ordinary issuance, and Crew Support's own issue/restore path", () => {
    expect(writers).toEqual(["lib/commercial/quotationIssuance.ts", "lib/crewSupport/quotation.ts"]);
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
  it("no database function sets a quotation to 'sent' (migrations only ever supersede or draft)", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const hits = readdirSync(dir).filter((f) => f.endsWith(".sql")).filter((f) => /update\s+public\.client_quotations\s+set[^;]*status\s*=\s*'sent'/i.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
