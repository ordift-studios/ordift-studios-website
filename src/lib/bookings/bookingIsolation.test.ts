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
  // Stage 3 (admin screens): the service is imported by exactly ONE server-actions file outside the bookings folder. Every function in the service refuses while the flag is off, and the page panel returns null.
  it("only the two booking server-actions files (enquiry page, rules screen) outside the bookings folder import the booking service", () => {
    const importers = src.filter(notTest).filter((f) => !f.startsWith("src/lib/bookings/")).filter((f) => /from\s+["']@\/lib\/bookings\/service["']/.test(read(f)));
    expect(importers.sort()).toEqual(["src/app/admin/enquiries/[id]/bookingActions.ts", "src/app/admin/settings/bookings/bookingSettingsActions.ts"]);
  });
  it("nothing imports the booking panel loader except the enquiry page, its actions and the rules screen", () => {
    const importers = src.filter(notTest).filter((f) => !f.startsWith("src/lib/bookings/")).filter((f) => /from\s+["']@\/lib\/bookings\/panel["']/.test(read(f))).sort();
    expect(importers).toEqual(["src/app/admin/enquiries/[id]/BookingPanel.tsx", "src/app/admin/enquiries/[id]/bookingActions.ts", "src/app/admin/enquiries/[id]/page.tsx", "src/app/admin/settings/bookings/page.tsx"]);
  });
  it("the panel loader reads nothing while the flag is off", () => { expect(read("src/lib/bookings/panel.ts")).toMatch(/export async function loadBookingPanel[\s\S]{0,260}if \(!bookingFlagOn\(env\)\) return null;/); });
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

describe("booking notifications: only a confirmation sends them", () => {
  const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  it("no payment code, payment route or webhook imports the booking notification module", () => {
    const offenders = src.filter(notTest).filter((f) => /^src\/(lib\/payments|app\/api\/(webhooks|payments)|app\/admin\/payments|app\/portal\/\(dashboard\)\/client\/projects\/\[kind\]\/\[id\]\/payments)/.test(f)).filter((f) => /bookings\/notification/.test(code(f)));
    expect(offenders).toEqual([]);
  });
  it("only the booking service (after a successful confirmation) and the Super Admin retry action import the dispatcher", () => {
    const importers = src.filter(notTest).filter((f) => /from\s+["'](@\/lib\/bookings\/notificationService|\.\/notificationService)["']/.test(read(f))).sort();
    expect(importers).toEqual(["src/app/admin/enquiries/[id]/BookingNotificationsCard.tsx", "src/app/admin/enquiries/[id]/bookingActions.ts", "src/lib/bookings/panel.ts", "src/lib/bookings/service.ts"].sort());
  });
  it("every dispatch sits after the booking function succeeded (confirm and cancel), and nowhere in the settings code", () => {
    const svc = code("src/lib/bookings/service.ts"); const confirm = svc.slice(svc.indexOf("export async function confirmOrdinaryBooking"), svc.indexOf("export type CancelOutcome")); const cancel = svc.slice(svc.indexOf("export async function cancelOrdinaryBooking"), svc.indexOf("export async function previewConflicts"));
    expect(confirm.indexOf("dispatchBookingNotifications(")).toBeGreaterThan(confirm.indexOf("if (error || !data)")); expect(cancel.indexOf("dispatchBookingNotifications(")).toBeGreaterThan(cancel.indexOf("if (error || !data)"));
    expect(svc.slice(svc.indexOf("export async function recordBookingSettingsVersion"))).not.toContain("dispatchBookingNotifications");
  });
  it("a deferral is recorded before anything is sent", () => {
    const svc = code("src/lib/bookings/service.ts"); for (const fn of ["confirmOrdinaryBooking", "cancelOrdinaryBooking"]) { const body = svc.slice(svc.indexOf(`export async function ${fn}`)); expect(body.indexOf("deferClientNotice(")).toBeGreaterThan(-1); expect(body.indexOf("deferClientNotice(")).toBeLessThan(body.indexOf("dispatchBookingNotifications(")); }
  });
  it("the notification module sends only through the shared notification dispatcher (test mode applies) and never imports a provider", () => {
    const n = code("src/lib/bookings/notificationService.ts"); expect(n).toContain("dispatchNotification("); expect(/from\s+["']resend["']|sendEmailNow|new Resend|nodemailer/.test(n)).toBe(false);
  });
  it("the proposal creates jobs only for a confirmation, grants no write, keeps sent rows immutable", () => {
    const sql = read("supabase/proposals/PROPOSAL_booking_notifications.sql");
    expect(sql).toMatch(/if new\.kind = 'confirmed' then/); expect(sql).toMatch(/after insert on public\.enquiry_booking_confirmations/); expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*on public\.booking_notification_jobs/i);
    expect(sql).toMatch(/booking_notification_already_sent/); expect(sql).toMatch(/booking_notification_jobs_are_permanent/); expect(sql).toMatch(/unique \(confirmation_id, audience\)/);
    expect(sql).not.toMatch(/(insert into|update|delete from) public\.(payments|enquiries|client_quotations)/i);
  });
});
