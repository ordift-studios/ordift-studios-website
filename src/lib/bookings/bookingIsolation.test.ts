import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// BOOKING CONFIRMATION - static security checks. The feature is inert until a later, separately authorised release: nothing imports it, it writes only through two database functions, it can create no payment/invoice/email,
// the thresholds are data, and the proposal grants no direct write access.
const root = process.cwd();
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (["node_modules", ".next", ".git"].includes(f) ? [] : walk(p)) : [p]; });
const read = (r: string) => readFileSync(join(root, r), "utf8");
const src = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => relative(root, f).replaceAll("\\", "/"));
const notTest = (f: string) => !/\.(test|e2e)\.tsx?$/.test(f);

describe("inert until released", () => {
  it("no production file outside the bookings folder imports the booking service", () => {
    const importers = src.filter(notTest).filter((f) => !f.startsWith("src/lib/bookings/")).filter((f) => /from\s+["']@\/lib\/bookings\/service["']/.test(read(f)));
    expect(importers).toEqual([]);
  });
  it("the flag defaults off: the rules module reads it as 'true' only", () => { expect(read("src/lib/bookings/rules.ts")).toMatch(/env\[BOOKING_FLAG\] === "true"/); });
});

describe("what the service can and cannot do", () => {
  const svc = read("src/lib/bookings/service.ts");
  it("writes only through the database functions, except one append-only INSERT of a new settings version: no update, delete or upsert, and no direct write to the confirmation tables", () => { expect(svc).not.toMatch(/\.(update|delete|upsert)\(/); expect(svc.match(/\.insert\(/g)?.length).toBe(1); expect(svc).toMatch(/from\("booking_rule_settings"\)\.insert\(/); expect(svc).not.toMatch(/from\("enquiry_booking_(confirmations|segments)"\)\.(insert|update|delete)/); expect(svc.match(/\.rpc\("([a-z_]+)"/g)?.sort()).toEqual(['.rpc("cancel_ordinary_booking"', '.rpc("confirm_ordinary_booking"', '.rpc("preview_booking_conflicts"']); });
  it("creates no payment, invoice, receivable or email", () => { const code = svc.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n").replace(/\/\/ .*$/gm, "");
    expect(/from\("payments"\)|from\("payment_obligations"\)|invoice|receivable|sendEmail|resend|nodemailer/i.test(code)).toBe(false); });
  it("every public action is gated by the flag and by Super Admin", () => { expect((svc.match(/bookingFlagOn\(env\)/g) ?? []).length).toBeGreaterThanOrEqual(3); expect((svc.match(/isSuperAdminId/g) ?? []).length).toBeGreaterThanOrEqual(3); });
});

describe("the business rules are data, not code", () => {
  it("no threshold number is written into the rules or the service", () => { for (const f of ["src/lib/bookings/rules.ts", "src/lib/bookings/service.ts"]) expect(read(f), f).not.toMatch(/\b(3000|3,000|10000|10,000)\b|\b800\b/); });
});

describe("the migration proposal", () => {
  const sql = read("supabase/proposals/PROPOSAL_booking_confirmation.sql");
  it("grants no direct write on the confirmation tables and keeps the functions server-only", () => {
    expect(sql).toMatch(/revoke all on public\.booking_rule_settings, public\.enquiry_booking_confirmations, public\.enquiry_booking_segments from anon, authenticated, service_role/);
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*on public\.enquiry_booking_(confirmations|segments)/i);
    for (const fn of ["confirm_ordinary_booking(jsonb, uuid)", "cancel_ordinary_booking(uuid, text, uuid)", "preview_booking_conflicts(uuid, jsonb, uuid)"]) expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated, service_role`);
  });
  it("re-checks the Super Admin, the entity's eligibility and the fingerprint inside the database", () => { expect(sql).toMatch(/booking_actor_is_super_admin\(p_actor\)/); expect(sql).toMatch(/private\.entity_issue_standing/); expect(sql).toMatch(/client_quotation\.content_fingerprint/); });
  it("is append-only and never touches payments, invoices or quotations", () => { expect(sql).toMatch(/booking_confirmations_append_only before update or delete/); expect(sql).not.toMatch(/(insert into|update|delete from) public\.(payments|payment_obligations|client_quotations)\b/); });
});
