import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Organisation registry — architectural guarantees, checked by reading the actual source (registry.ts is DB-dependent from its first line,
// the same limitation documented across this codebase, so its behaviour is covered by the pure-function tests next to it and by these
// structural assertions). Nothing here needs a database.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const registry = read("src/lib/organisations/registry.ts");
const actions = read("src/app/admin/organisations/actions.ts");
const migration = read("supabase/migrations/0163_organisations_supplier_approvals.sql");
const rollback = read("supabase/rollbacks/down_0163.sql");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const rel = join(dir, f);
    return statSync(join(ROOT, rel)).isDirectory() ? sourceFiles(rel) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [rel] : [];
  });
}
const ownFiles = [...sourceFiles("src/lib/organisations"), ...sourceFiles("src/app/admin/organisations")];
const importsOf = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("an approval never creates financial or booking records", () => {
  it("nothing in the module imports payments, payables, invoices, bookings, quotations or pricing code", () => {
    const forbidden = /(payments|payables|payout|invoice|booking|quotation|pricing|commission|crewSupport|workshops)/i;
    for (const f of ownFiles) {
      const bad = importsOf(read(f)).filter((i) => forbidden.test(i));
      expect(bad, `${f} imports ${bad.join(", ")}`).toEqual([]);
    }
  });
  it("the module never writes to a financial, booking, vendor or production-supplier table", () => {
    const tables = [...registry.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["organisations", "supplier_applications", "organisation_relationships"]));
  });
  it("the migration references no financial or booking table", () => {
    const refs = [...migration.matchAll(/references public\.([a-z_]+)/g)].map((m) => m[1]);
    expect(new Set(refs)).toEqual(new Set(["businesses", "profiles", "organisations", "supplier_applications"]));
  });
});

describe("no mailbox, no outbound email, no automation", () => {
  it("the module has no mail, network or scheduling dependency", () => {
    for (const f of ownFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/\bfetch\(|resend|nodemailer|googleapis|\bimap\b|setInterval|\bcron\b/i);
      expect(importsOf(src).filter((i) => /resend|nodemailer|googleapis|imap/i.test(i)), f).toEqual([]);
    }
  });
});

describe("authorisation", () => {
  it("every exported registry function authorises the actor before touching data", () => {
    const fns = registry.split(/\nexport async function /).slice(1).map((s) => [s.slice(0, s.indexOf("(")), s] as const);
    expect(fns.length).toBeGreaterThanOrEqual(9);
    for (const [name, body] of fns) {
      expect(body, `${name} must call authorize()`).toMatch(/authorize\(/);
      const firstData = body.indexOf("createAdminClient()");
      if (firstData !== -1) expect(body.indexOf("authorize("), name).toBeLessThan(firstData);
    }
  });
  it("authorisation is the capability with Super Admin override, never a role string", () => {
    expect(registry).toContain("STRATEGY_CAPABILITIES.organisationRegistryAdminister");
    expect(registry).not.toMatch(/hasRole\(|isSuperAdmin\(/);
  });
  it("every server action resolves the signed-in user and delegates to the governed lib", () => {
    const fns = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    expect(fns.sort()).toEqual(["closeApplicationAction", "confirmApprovalAction", "discardApprovalEmailAction", "recordApplicationAction", "submitApprovalEmailAction"]);
    expect(actions.match(/await actor\(\)/g)?.length).toBe(fns.length);
    expect(actions).not.toContain("createAdminClient");
  });
  it("each admin page redirects unless the capability authorises the user", () => {
    for (const p of ["src/app/admin/organisations/page.tsx", "src/app/admin/organisations/applications/page.tsx", "src/app/admin/organisations/applications/[id]/page.tsx"]) {
      expect(read(p), p).toContain("authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister)");
    }
  });
});

describe("human confirmation is the only way a relationship changes", () => {
  it("only confirmApproval writes organisation_relationships or creates organisations", () => {
    const sections = registry.split(/\nexport async function /);
    const writers = sections.filter((s) => /\.from\("organisation_relationships"\)\s*\n?\s*\.(insert|update)|organisation_relationships"\)\.(insert|update)|from\("organisations"\)\s*\n?\s*\.insert/.test(s)).map((s) => s.slice(0, s.indexOf("(")));
    expect(writers.filter((w) => !["confirmApproval"].includes(w))).toEqual([]);
    expect(writers).toContain("confirmApproval");
  });
  it("attaching an email only moves an application to pending_confirmation", () => {
    const attach = registry.slice(registry.indexOf("export async function submitApprovalEmail"), registry.indexOf("export async function discardApprovalEmail"));
    expect(attach).toContain('status: "pending_confirmation"');
    expect(attach).not.toMatch(/organisation_relationships|from\("organisations"\)\s*\n?\s*\.insert|status: "approved"/);
  });
  it("closing the application is compare-and-set on its status", () => {
    expect(registry).toMatch(/\.eq\("status", "pending_confirmation"\)\s*\n\s*\.select\("id"\)/);
  });
  it("the recorded relationship kind is always 'client' (approved Ordift as its supplier); vendor/contractor records are untouched", () => {
    expect(registry).not.toMatch(/kind: "vendor"/);
    expect(registry).not.toMatch(/production_suppliers|vendor_profiles|vendor_documents/);
  });
});

describe("migration 0163 is additive, schema-only and locked down", () => {
  it("creates exactly the three tables and alters nothing that exists", () => {
    expect([...migration.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(["organisation_relationships", "organisations", "supplier_applications"]);
    expect(migration).not.toMatch(/alter table public\.(?!organisations|supplier_applications|organisation_relationships)\w+\s+(add|drop|alter)/i);
    expect(migration).not.toMatch(/\b(insert into|update public|delete from|drop table|truncate)\b/i);
  });
  it("enables RLS with a Super-Admin-only read policy and no delete grant on every table", () => {
    for (const t of ["organisations", "supplier_applications", "organisation_relationships"]) {
      expect(migration).toContain(`alter table public.${t} enable row level security;`);
      expect(migration).toContain(`create policy "${t}: super admin only" on public.${t} for select to authenticated using ((select private.is_super_admin()));`);
      expect(migration).toContain(`grant select, insert, update on public.${t} to service_role;`);
      expect(migration).toContain(`revoke all on public.${t} from anon, authenticated, service_role;`);
    }
    expect(migration).not.toMatch(/grant [^;]*\bdelete\b/i);
  });
  it("refuses deletes and freezes an approved application and the original approval date", () => {
    expect(migration).toContain("create trigger organisations_guard before update or delete");
    expect(migration).toContain("create trigger supplier_applications_guard before update or delete");
    expect(migration).toContain("create trigger organisation_relationships_guard before update or delete");
    expect(migration).toContain("an approved supplier application cannot be edited");
    expect(migration).toContain("the original approval date of a relationship cannot be rewritten");
  });
  it("prevents duplicates in the database (unique normalised name; one relationship per organisation and kind; one email per application)", () => {
    expect(migration).toContain("unique (business_id, normalized_name)");
    expect(migration).toContain("unique (organisation_id, kind)");
    expect(migration).toContain("supplier_applications_approval_hash_uniq");
  });
  it("the rollback refuses to run once any record exists", () => {
    expect(rollback).toContain("down_0163 refused");
    expect(rollback.indexOf("raise exception")).toBeLessThan(rollback.indexOf("drop table"));
  });
});
