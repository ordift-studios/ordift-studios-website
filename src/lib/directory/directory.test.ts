import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Client Directory v1 — architectural guarantees, checked by reading the actual source (directory.ts is DB-dependent from its first line, the same
// limitation documented across this codebase, so behaviour is covered by the pure-function tests next to it and by these structural assertions).
// No test database is used.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const directory = read("src/lib/directory/directory.ts");
const actions = read("src/app/admin/organisations/directoryActions.ts");
const migration = read("supabase/migrations/0164_client_directory_contacts.sql");
const rollback = read("supabase/rollbacks/down_0164.sql");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const rel = join(dir, f);
    return statSync(join(ROOT, rel)).isDirectory() ? sourceFiles(rel) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [rel] : [];
  });
}
const ownFiles = [...sourceFiles("src/lib/directory"), ...sourceFiles("src/app/admin/organisations")];
const importsOf = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("the directory never touches money, stages or suppliers", () => {
  it("nothing in the module imports payments, payables, pricing, workflow, vendor or crew-support code", () => {
    const forbidden = /(payments|payables|payout|invoice|pricing|commercial|workflow|crewSupport|vendor|engagements)/i;
    for (const f of ownFiles) {
      const bad = importsOf(read(f)).filter((i) => forbidden.test(i));
      expect(bad, `${f} imports ${bad.join(", ")}`).toEqual([]);
    }
  });
  it("only the directory's own tables are written; enquiries and quotations are written ONLY in their two link columns", () => {
    const writes = [...directory.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.(insert|update)\(/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(new Set(writes)).toEqual(new Set(["contacts:insert", "contacts:update", "contact_emails:insert", "contact_emails:update", "organisations:insert"]));
    // The two link writes go through a table-name lookup; they must set exactly contact_id and organisation_id and nothing else.
    const linkWrites = [...directory.matchAll(/\.from\(TABLE\[params\.subject\.type\]\)\.update\((\{[^}]*\})\)/g)].map((m) => m[1].replace(/\s+/g, " "));
    expect(linkWrites.length).toBe(2);
    expect(linkWrites).toContain("{ contact_id: params.contactId, organisation_id: params.organisationId }");
    expect(linkWrites).toContain("{ contact_id: null, organisation_id: null }");
    expect(directory).not.toMatch(/from\("(enquiries|client_quotations)"\)\s*\n?\s*\.(insert|update|delete|upsert)/);
  });
  it("nothing is ever deleted and no relationship, application or stage is written", () => {
    expect(directory).not.toMatch(/\.delete\(|\.upsert\(/);
    expect(directory).not.toMatch(/\.from\("(organisation_relationships|supplier_applications)"\)\s*\n?\s*\.(insert|update|upsert|delete)/);
    expect(directory).not.toMatch(/crm_stage:|payment_country:|payment_status:|amount_due|amount_paid|status: "booked"/);
    expect(directory).not.toMatch(/booking_contracting_entities"\)\s*\n?\s*\.(insert|update)/);
  });
  it("the contracting entity and payment market are only READ (selected), never set", () => {
    expect(directory).toContain('from("booking_contracting_entities").select(');
    expect(directory).not.toMatch(/employing_entities"\)\s*\n?\s*\.(insert|update)/);
  });
});

describe("no mailbox, no outbound email, no automatic linking or merging", () => {
  it("the module has no mail, network or scheduling dependency", () => {
    for (const f of ownFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/\bfetch\(|resend|nodemailer|googleapis|\bimap\b|setInterval|\bcron\b/i);
    }
  });
  it("there is no merge function and no bulk linking: every link write names one record", () => {
    expect(directory).not.toMatch(/export async function (merge|backfill|autoLink|linkAll|bulk)/i);
    expect(directory).not.toMatch(/\.in\("id",[^)]*\)\s*\n?\s*\.select\("id"\)/);
  });
  it("the review list only reads; suggestions are computed on view and nothing is written by it", () => {
    const review = directory.slice(directory.indexOf("export async function listEnquiriesForLinkReview"));
    expect(review).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

describe("authorisation", () => {
  it("every exported directory function authorises the actor before touching data", () => {
    const fns = directory.split(/\nexport (?:async )?function /).slice(1).map((s) => [s.slice(0, s.indexOf("(")), s] as const).filter(([, body]) => /createAdminClient|actorUserId/.test(body));
    expect(fns.length).toBeGreaterThanOrEqual(17);
    for (const [name, body] of fns) {
      if (name === "parseAddressList") continue;
      expect(body, `${name} must call authorize()`).toMatch(/authorize\(/);
      const firstData = body.indexOf("createAdminClient()");
      if (firstData !== -1) expect(body.indexOf("authorize("), name).toBeLessThan(firstData);
    }
  });
  it("authorisation is the existing capability with Super Admin override, never a role string", () => {
    expect(directory).toContain("STRATEGY_CAPABILITIES.organisationRegistryAdminister");
    expect(directory).not.toMatch(/hasRole\(|isSuperAdmin\(/);
  });
  it("every server action resolves the signed-in user and delegates to the governed lib", () => {
    const fns = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    expect(fns).toHaveLength(12);
    expect(actions.match(/await actor\(\)/g)?.length).toBe(fns.length);
    expect(actions).not.toContain("createAdminClient");
  });
  it("each directory page redirects unless the capability authorises the user", () => {
    for (const p of ["src/app/admin/organisations/page.tsx", "src/app/admin/organisations/[id]/page.tsx", "src/app/admin/organisations/contacts/page.tsx", "src/app/admin/organisations/contacts/[id]/page.tsx", "src/app/admin/organisations/link-enquiries/page.tsx"]) {
      expect(read(p), p).toContain("authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister)");
    }
  });
  it("the enquiry and quotation pages render the client-record panel only for a Super Admin, and the panel re-checks authorisation", () => {
    expect(read("src/app/admin/enquiries/[id]/page.tsx")).toMatch(/user && isSuperAdmin\(user\) \? \(\s*<>\s*<ClientRecordPanel/);
    expect(read("src/app/admin/pricing/quotations/[id]/page.tsx")).toMatch(/isSuperAdmin\(user\) \? \(\s*<div className="mt-6 space-y-6">\s*<ContractingEntitySection[^>]*\/>\s*<ClientRecordPanel/);
    expect(read("src/app/admin/organisations/ClientRecordPanel.tsx")).toContain("if (!context) return null;");
  });
  it("the existing enquiry and quotation pages are otherwise unchanged apart from the panel and its import", () => {
    // Guards against accidental behaviour changes to stage, amount or payment forms on these pages.
    const enquiry = read("src/app/admin/enquiries/[id]/page.tsx");
    expect(enquiry).toContain("<UpdateStageForm");
    expect(enquiry).toContain("<SetAmountDueForm");
    expect(enquiry).toContain("<PaymentMarketForm");
  });
});

describe("migration 0164 is additive, schema-only and locked down", () => {
  it("creates exactly two tables and only adds four nullable columns to existing tables", () => {
    expect([...migration.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(["contact_emails", "contacts"]);
    const alters = [...migration.matchAll(/alter table public\.(\w+)\s+add column contact_id[^;]*;/g)];
    expect(alters.map((m) => m[1]).sort()).toEqual(["client_quotations", "enquiries"]);
    for (const [stmt] of alters) {
      expect(stmt).toContain("add column organisation_id");
      expect(stmt).not.toMatch(/not null|default/i);
      expect(stmt.match(/on delete restrict/g)?.length).toBe(2);
    }
    expect(migration).not.toMatch(/alter table public\.(?!contacts|contact_emails|enquiries|client_quotations)\w+\s+(add|drop|alter)/i);
    expect(migration).not.toMatch(/\b(insert into|update public|delete from|drop table|drop column|truncate)\b/i);
    expect(migration).not.toMatch(/alter table public\.(enquiries|client_quotations)\s+(drop|alter column)/i);
  });
  it("never links, backfills or reassigns existing records (no statement touches existing rows)", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\bset\s+(contact_id|organisation_id)\s*=/i);
  });
  it("scopes rows to the platform business, not to a Ghana or Qatar entity", () => {
    expect(migration).toContain("business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id()");
    expect(migration).not.toMatch(/employing_entity_id|references public\.employing_entities/);
    expect(migration).toContain("NOT a Ghana or Qatar legal entity");
  });
  it("enables RLS with a Super-Admin-only read policy and no delete grant on both new tables", () => {
    for (const t of ["contacts", "contact_emails"]) {
      expect(migration).toContain(`alter table public.${t} enable row level security;`);
      expect(migration).toContain(`create policy "${t}: super admin only" on public.${t} for select to authenticated using ((select private.is_super_admin()));`);
      expect(migration).toContain(`grant select, insert, update on public.${t} to service_role;`);
      expect(migration).toContain(`revoke all on public.${t} from anon, authenticated, service_role;`);
    }
    expect(migration).not.toMatch(/grant [^;]*\bdelete\b/i);
  });
  it("prevents duplicate people in the database while allowing shared mailboxes and several addresses per person", () => {
    expect(migration).toContain("create unique index contact_emails_personal_email_uniq on public.contact_emails (business_id, email) where not is_shared and removed_at is null;");
    expect(migration).toContain("create unique index contact_emails_contact_email_uniq on public.contact_emails (contact_id, email) where removed_at is null;");
    expect(migration).toContain("create unique index contact_emails_one_primary_uniq on public.contact_emails (contact_id) where is_primary and removed_at is null;");
    expect(migration).toContain("create unique index contacts_profile_id_uniq on public.contacts (profile_id) where profile_id is not null;");
    expect(migration).toContain("check (email = lower(email)");
  });
  it("refuses deletes, keeps addresses immutable, and stops non-Super-Admin sessions from setting the four links", () => {
    for (const t of ["contacts", "contact_emails"]) expect(migration).toContain(`create trigger ${t}_guard before update or delete on public.${t}`);
    expect(migration).toContain("an email address cannot be edited or moved to another contact");
    expect(migration).toContain("a removed email address cannot be restored");
    expect(migration).toContain("create trigger enquiries_directory_link_guard before insert or update on public.enquiries");
    expect(migration).toContain("create trigger client_quotations_directory_link_guard before insert or update on public.client_quotations");
    expect(migration).toContain("current_user in ('authenticated', 'anon')");
    expect(migration).toContain("not private.is_super_admin()");
  });
  it("the rollback refuses to run once any contact exists or any record is linked", () => {
    expect(rollback).toContain("down_0164 refused: directory contacts already exist");
    expect(rollback).toContain("down_0164 refused: enquiries or quotations are already linked to the directory");
    expect(rollback.indexOf("raise exception")).toBeLessThan(rollback.indexOf("drop table"));
    expect(rollback.indexOf("raise exception")).toBeLessThan(rollback.indexOf("drop column"));
  });
});
