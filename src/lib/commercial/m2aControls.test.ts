import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Enquiry-to-booking M2a — structural guarantees of migration 0166 and its rollback, checked by reading the SQL (no database is used here; the behaviour
// itself is exercised against a throwaway local Postgres by scripts/m2a-local/*).

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const migration = read("supabase/migrations/0166_m2a_quotation_amount_controls.sql");
const rollback = read("supabase/rollbacks/down_0166.sql");
const sqlCode = (src: string) => src.replace(/^\s*--.*$/gm, "");
const body = (name: string) => {
  const start = migration.indexOf(`function public.${name}`);
  const end = migration.indexOf("$$;", migration.indexOf("as $$", start) + 5);
  return migration.slice(start, end);
};
const FUNCTIONS = ["revise_ordinary_quotation", "establish_enquiry_amount_due", "override_enquiry_amount_due"] as const;

describe("migration 0166 is additive and locked down", () => {
  const code = sqlCode(migration);
  const topLevel = code.replace(/as \$\$[\s\S]*?\$\$;/g, ""); // statements outside function bodies
  it("creates only new objects and never drops, truncates or rewrites existing data at the top level", () => {
    expect(topLevel).not.toMatch(/\bdrop\s+(table|column|index|constraint)\b/i);
    expect(topLevel).not.toMatch(/\balter\s+table\s+public\.(enquiries|payments)\b/i);
    expect(topLevel).not.toMatch(/^\s*(delete\s+from|truncate)\b/im);
    expect(topLevel).not.toMatch(/^\s*update\s+public\./im);
    expect(topLevel).not.toMatch(/^\s*insert\s+into\b/im);
  });
  it("the ledger is append-only for everyone, including a truncate", () => {
    expect(code).toMatch(/before update or delete on public\.enquiry_amount_events/);
    expect(code).toMatch(/before truncate on public\.enquiry_amount_events/);
    expect(code).toMatch(/enable row level security/);
    expect(code).toMatch(/revoke all on public\.enquiry_amount_events from anon, authenticated, service_role/);
    expect(code).not.toMatch(/grant\s+(insert|update|delete)[^;]*enquiry_amount_events/i);
  });
  it("the one-live-quotation index covers only linked ordinary quotations in a live status", () => {
    expect(code).toMatch(/create unique index client_quotations_one_live_per_enquiry on public\.client_quotations \(enquiry_id\)\s+where enquiry_id is not null and crew_support_request_id is null and status in \('draft', 'ready', 'sent', 'accepted'\)/);
  });
  it("quotation currency must exist in the currencies table", () => {
    expect(code).toMatch(/client_quotations_currency_fk foreign key \(currency\) references public\.currencies \(code\)/);
  });
});

describe("the three functions are server-only, atomic and side-effect free", () => {
  for (const fn of FUNCTIONS) {
    it(`${fn}: security definer with an empty search_path, executable by service_role only`, () => {
      const b = body(fn);
      expect(b).toMatch(/security definer set search_path = ''/);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
    });
    it(`${fn}: never touches the stage, a notification, an email, the network, or a payment, obligation, engagement, deliverable or Crew Support table`, () => {
      // prospect_email is a quotation column copied as data (not an email being sent); every other mention would be a defect.
      const b = sqlCode(body(fn)).replace(/prospect_email/g, "prospect_contact");
      expect(b).not.toMatch(/crm_stage|notif|email|pg_net|http_post|pg_notify|dblink/i);
      expect(b).not.toMatch(/(insert into|update|delete from)\s+public\.(payments|payment_obligations|engagements|crew_support|deliverables)/i);
    });
  }
  it("revise and establish lock the enquiry before the quotation (one global lock order, so no deadlock)", () => {
    for (const fn of ["revise_ordinary_quotation", "establish_enquiry_amount_due"] as const) {
      const b = body(fn);
      const enq = b.search(/from public\.enquiries[^;]*for update/);
      const quo = b.search(/from public\.client_quotations[^;]*for update/);
      expect(enq, `${fn} locks the enquiry`).toBeGreaterThan(-1);
      expect(quo, `${fn} locks the quotation`).toBeGreaterThan(enq);
    }
  });
  it("revise supersedes the original BEFORE inserting the new version, all inside the one function", () => {
    const b = body("revise_ordinary_quotation");
    const sup = b.indexOf("set status = 'superseded'");
    const ins = b.indexOf("insert into public.client_quotations");
    const items = b.indexOf("insert into public.client_quotation_items");
    const audit = b.indexOf("insert into public.activity_log");
    expect(sup).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(sup);
    expect(items).toBeGreaterThan(ins);
    expect(audit).toBeGreaterThan(items);
  });
  it("establish enforces the rate policy on the server: 30 days, 10 percent, a source note, and the previewed rate", () => {
    const b = body("establish_enquiry_amount_due");
    expect(b).toContain("interval '30 days'");
    expect(b).toContain("c_max_jump constant numeric := 0.10");
    for (const code of ["rate_stale", "rate_source_missing", "rate_changed_since_preview", "rate_jump_unacknowledged", "contracting_entity_missing", "payment_market_not_set", "currency_market_mismatch", "total_not_consistent", "payments_exist_amount_differs", "different_quotation_supplies_amount"]) {
      expect(b, code).toContain(`ordift:${code}`);
    }
  });
  it("override is Super Admin only and needs a category, a long enough reason, distinct words and evidence", () => {
    const b = body("override_enquiry_amount_due");
    expect(b).toContain("array['super_admin']");
    for (const code of ["category_invalid", "reason_too_short", "reason_not_meaningful", "evidence_required", "amount_below_paid", "crew_support_excluded"]) expect(b, code).toContain(`ordift:${code}`);
    expect(b).toContain("count(distinct w)");
  });
});

describe("rollback down_0166", () => {
  it("refuses once any M2a data exists and otherwise removes exactly what 0166 added", () => {
    expect(rollback).toContain("down_0166 refused: enquiry_amount_events has rows");
    expect(rollback).toContain("down_0166 refused: ordinary quotations are linked to enquiries");
    for (const o of ["override_enquiry_amount_due", "establish_enquiry_amount_due", "revise_ordinary_quotation", "client_quotations_currency_fk", "client_quotations_one_live_per_enquiry", "enquiry_amount_events", "actor_has_role"]) expect(rollback).toContain(o);
  });
});
