import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sendEmail } from "@/lib/shared/email/dispatch";

// Enquiry-to-booking M1 — architectural guarantees, checked by reading the actual source (the services are DB-dependent from their first line, the same
// limitation documented across this codebase), plus real behaviour for the pieces that can run without a database. No test database is used.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Assertions about what code DOES ignore explanatory comments (which rightly name the things the code must not do).
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const importsOf = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

const service = read("src/lib/enquiry/staffIntakeService.ts");
const intakeAction = read("src/app/admin/enquiries/staffIntakeActions.ts");
const acceptance = read("src/lib/commercial/quotationAcceptance.ts");
const quotations = read("src/lib/commercial/clientQuotations.ts");
const lifecycle = read("src/lib/enquiry/lifecycleEmails.ts");
const dispatch = read("src/lib/shared/email/dispatch.ts");
const entities = read("src/lib/organization/entityRegistrations.ts");
const migration = read("supabase/migrations/0165_staff_recorded_enquiries.sql");
const rollback = read("supabase/rollbacks/down_0165.sql");

describe("a staff-recorded enquiry sends nothing and creates nothing financial", () => {
  it("the intake service and action import no email, notification, spreadsheet, payment, pricing or quotation code", () => {
    const forbidden = /(email|notification|sheets|payments|pricing|commercial|crewSupport|storage)/i;
    for (const [name, src] of [["service", service], ["action", intakeAction]] as const) {
      const bad = importsOf(src).filter((i) => forbidden.test(i) && !/shared\/email\/placeholder/.test(i));
      expect(bad, `${name} imports ${bad.join(", ")}`).toEqual([]);
    }
    expect(service + intakeAction).not.toMatch(/sendEmail|sendAcknowledgement|sendAdminNotification|syncEnquiryToSheets|dispatchNotification|fetch\(/);
  });
  it("it writes only the enquiry row and an internal note, at the ordinary first stage, with no amount, payment, quotation or booking field", () => {
    const writes = [...service.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.(insert|update|upsert|delete)\(/g)].map((m) => `${m[1]}:${m[2]}`);
    // The one update is the explicit, admin-only emails on/off switch (tested below); it writes only that flag.
    expect(new Set(writes)).toEqual(new Set(["enquiries:insert", "enquiry_notes:insert", "enquiries:update"]));
    expect([...service.matchAll(/\.update\((\{[^}]*\})\)/g)].map((m) => m[1])).toEqual(["{ email_notifications_suppressed: suppress }"]);
    expect(service).toContain('crm_stage: "new_lead"');
    expect(code(service)).not.toMatch(/amount_due|amount_paid|payment_status|payment_country|client_quotations|payments"|booked|accepted_quotation/);
    expect(service).toContain('audience: "internal"');
  });
  it("it switches automatic client emails off unless the staff member explicitly allows them", () => {
    expect(service).toContain("email_notifications_suppressed: v.suppressEmails");
    expect(intakeAction).toContain('allowStatusEmails: formData.get("allowStatusEmails") === "on"');
  });
  it("it authorises the actor before touching data, and directory linking goes through the directory's own authority", () => {
    expect(service.indexOf("isStaffOrAdmin(user)")).toBeGreaterThan(-1);
    expect(service.indexOf("isStaffOrAdmin(user)")).toBeLessThan(service.indexOf("createAdminClient()"));
    expect(service).toContain("linkRecord(");
    expect(service).not.toMatch(/from\("(contacts|organisations|contact_emails)"\)\s*\n?\s*\.(insert|update)/);
  });
  it("a missing email address is stored as the reserved placeholder, never as a guessed address", () => {
    expect(service).toContain("v.email ?? placeholderEmailFor(reference)");
  });
});

describe("the shared email dispatcher never sends to a placeholder address", () => {
  it("refuses a placeholder recipient without contacting any provider", async () => {
    const r = await sendEmail({ to: "enq-2026-000099@no-email.invalid", subject: "s", html: "<p>h</p>", text: "t", logPrefix: "[test]", emailType: "test", referenceNumber: null });
    expect(r).toEqual({ ok: true, mode: "logged", attempts: 0 });
  });
  it("the guard runs before any provider call in both send paths", () => {
    const first = dispatch.indexOf("isPlaceholderEmail(to)");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(dispatch.indexOf("productionSendingEnabled()", dispatch.indexOf("export async function sendEmail(")));
    const second = dispatch.indexOf("isPlaceholderEmail(to)", first + 10);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(dispatch.indexOf("new Resend(apiKey)"));
  });
  it("the three client lifecycle emails check the suppression flag before sending", () => {
    for (const fn of ["sendQuotationReadyEmail", "sendBookingConfirmedEmail", "sendFilesReadyEmail"]) {
      const body = lifecycle.slice(lifecycle.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 400), fn).toContain("clientEmailsSuppressed(");
      expect(body.indexOf("clientEmailsSuppressed("), fn).toBeLessThan(body.indexOf("dispatchNotification("));
    }
  });
});

describe("recorded acceptance is not a booking, an obligation or an email", () => {
  it("writes only the quotation's acceptance record, compare-and-set on 'sent', with every evidence field", () => {
    const writes = [...acceptance.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.(insert|update|upsert|delete)\(/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(writes).toEqual(["client_quotations:update"]);
    for (const col of ["accepted_via: \"staff_recorded\"", "accepted_by_name", "acceptance_channel", "acceptance_evidence", "acceptance_received_at", "acceptance_recorded_by", "accepted_at"]) expect(acceptance).toContain(col);
    expect(acceptance).toMatch(/\.eq\("status", "sent"\)\s*\n\s*\.select\("id"\)/);
  });
  it("does not set an amount due, create a payment, change a stage, or send anything", () => {
    expect(code(acceptance)).not.toMatch(/amount_due|amount_paid|crm_stage|payments|payables|obligation|receivable|invoice|sendEmail|dispatchNotification|lifecycleEmails/);
    expect(importsOf(acceptance).filter((i) => /payments|notifications|email|enquiry/.test(i))).toEqual([]);
  });
  it("refuses Crew Support quotations and anything that is not an issued quotation", () => {
    expect(acceptance).toContain("crew_support_request_id");
    expect(acceptance).toMatch(/q\.status !== "sent"/);
  });
  it("the generic status update can no longer flip a quotation to accepted without evidence", () => {
    const fn = quotations.slice(quotations.indexOf("export async function updateQuotationStatus"));
    expect(fn.indexOf('params.status === "accepted"')).toBeGreaterThan(-1);
    expect(fn.indexOf('params.status === "accepted"')).toBeLessThan(fn.indexOf("createAdminClient()"));
    const ui = read("src/app/admin/pricing/quotations/[id]/QuotationStatusActions.tsx");
    expect(code(ui)).not.toContain("Mark Accepted");
    expect(ui).toContain("recordQuotationAcceptanceAction");
  });
});

describe("the contracting entity is chosen explicitly and never inferred", () => {
  it("ordinary enquiries and quotations are refused once accepted or paid, and Crew Support ones are redirected to their request", () => {
    const gate = entities.slice(entities.indexOf("export async function ordinarySubjectGate"), entities.indexOf("export async function chooseContractingEntity"));
    expect(gate).toContain("creative_crew_support");
    expect(gate).toContain("amount_paid");
    expect(gate).toMatch(/status === "accepted"|eq\("status", "accepted"\)/);
    const choose = entities.slice(entities.indexOf("export async function chooseContractingEntity"));
    expect(choose.indexOf("ordinarySubjectGate(")).toBeGreaterThan(-1);
    expect(choose.indexOf("ordinarySubjectGate(")).toBeLessThan(choose.indexOf("listContractingCandidates("));
  });
  it("the form preselects nothing and the action is Super Admin only", () => {
    const form = read("src/app/admin/organisations/ContractingEntityForm.tsx");
    expect(form).toContain('defaultValue=""');
    expect(code(form)).not.toMatch(/suggest|currency|country/i);
    const action = read("src/app/admin/organisations/contractingActions.ts");
    expect(action).toContain("isSuperAdmin(user)");
    expect(code(action)).not.toMatch(/suggest|currency|country/i);
  });
});

describe("the workflow summary is read-only", () => {
  it("the facts loader and component only read", () => {
    for (const f of ["src/lib/enquiry/workflowFacts.ts", "src/components/admin/WorkflowSummary.tsx", "src/lib/enquiry/workflowSummary.ts"]) {
      expect(code(read(f)), f).not.toMatch(/\.(insert|update|upsert|delete)\(|sendEmail|dispatchNotification/);
    }
  });
  it("the stage names and their meaning are untouched: the enum and the booking rule are not redefined", () => {
    const summary = read("src/lib/enquiry/workflowSummary.ts");
    expect(summary).toContain('CRM_STAGES.indexOf("booked")');
    expect(code(summary)).not.toMatch(/crm_stage: ?"/);
  });
});

describe("existing payment and booking behaviour outside M1 is untouched", () => {
  it("full payment still advances to booked and still emails through the (now suppressible) sender; the amount-due action is unchanged", () => {
    const sync = read("src/lib/payments/crmStageSync.ts");
    expect(sync).toContain("advanceStageOnFullPayment");
    expect(sync).toContain("sendBookingConfirmedEmail(");
    expect(sync).not.toContain("email_notifications_suppressed");
    const amount = read("src/app/admin/enquiries/actions.ts");
    expect(amount).toContain('updates.crm_stage = "quotation_sent"');
    expect(amount).toContain("sendQuotationReadyEmail(");
    expect(amount).not.toContain("email_notifications_suppressed");
  });
  it("the public enquiry route keeps its acknowledgement and admin notification exactly as before", () => {
    const route = read("src/app/api/enquiry/route.ts");
    expect(route).toContain("sendAcknowledgementEmail(record)");
    expect(route).toContain("sendAdminNotificationEmail(record)");
    expect(route).not.toMatch(/source_channel|email_notifications_suppressed|created_by/);
  });
  it("no deposit percentage, payment term or stage definition is changed by M1 code", () => {
    for (const f of ["src/lib/enquiry/staffIntakeService.ts", "src/lib/commercial/quotationAcceptance.ts", "src/lib/enquiry/workflowSummary.ts"]) {
      expect(code(read(f)), f).not.toMatch(/deposit|payment_booking_terms|depositPercent|paymentCondition/i);
    }
  });
});

describe("migration 0165 is additive and locked down", () => {
  it("only adds four columns and a shape check to enquiries; email stays mandatory; no data statement", () => {
    expect([...code(migration).matchAll(/alter table public\.(\w+)/g)].map((m) => m[1])).toEqual(["enquiries"]);
    for (const col of ["source_channel text", "received_at timestamptz", "created_by uuid references public.profiles (id)", "email_notifications_suppressed boolean not null default false"]) expect(migration).toContain(`add column ${col}`);
    expect(code(migration)).not.toMatch(/alter column|drop column|drop constraint|\binsert into\b|\bupdate public\b|\bdelete from\b|set not null|drop not null/i);
  });
  it("existing rows are unchanged: no backfill, no value set on any existing enquiry", () => {
    expect(migration).not.toMatch(/\bset\s+(source_channel|received_at|created_by|email_notifications_suppressed)\b/i);
    expect(migration).toContain("NULL on every existing row");
  });
  it("a guard stops signed-in non-Super-Admin sessions from setting the intake fields; the server (service role) is unaffected", () => {
    expect(migration).toContain("create trigger enquiries_intake_guard before insert or update on public.enquiries");
    expect(migration).toContain("current_user in ('authenticated', 'anon')");
    expect(migration).toContain("not private.is_super_admin()");
  });
  it("the rollback refuses once any enquiry carries intake information", () => {
    expect(rollback).toContain("down_0165 refused");
    expect(rollback.indexOf("raise exception")).toBeLessThan(rollback.indexOf("drop column"));
  });
});

describe("automatic client emails are off by default and enabling them is an explicit, authorised, audited action", () => {
  it("only an admin can tick 'allow' at recording, and 'allow' needs a real email address", () => {
    expect(service).toMatch(/params\.input\.allowStatusEmails && !\(hasRole\(user, "admin"\) \|\| isSuperAdmin\(user\)\)/);
    expect(service.indexOf("params.input.allowStatusEmails &&")).toBeLessThan(service.indexOf("createAdminClient()"));
    const page = read("src/app/admin/enquiries/new/page.tsx");
    expect(page).toContain("canAllowEmails ?");
  });
  it("switching on later needs admin, a reason, a staff-recorded enquiry and a real address, and is audited; it sends nothing", () => {
    const fn = service.slice(service.indexOf("export async function setStaffEnquiryEmailNotifications"));
    expect(fn).toContain('hasRole(user, "admin") || isSuperAdmin(user)');
    expect(fn).toContain("reason.length < 5");
    expect(fn).toContain("e.created_by === null");
    expect(fn).toContain("isPlaceholderEmail(e.email)");
    expect(fn).toMatch(/enquiry\.client_emails_enabled/);
    expect(code(fn)).not.toMatch(/sendEmail|dispatchNotification|lifecycleEmails/);
    const writes = [...fn.matchAll(/\.update\((\{[^}]*\})\)/g)].map((m) => m[1]);
    expect(writes).toEqual(["{ email_notifications_suppressed: suppress }"]);
  });
  it("a staff-recorded enquiry is created suppressed unless explicitly allowed (the default is the safe one)", () => {
    expect(read("src/lib/enquiry/staffIntake.ts")).toContain("suppressEmails: !input.allowStatusEmails");
  });
});

describe("a placeholder address cannot become an identity or a payment email", () => {
  it("sign-up refuses it, account linking ignores it, checkout refuses it, and the directory never stores it", () => {
    expect(read("src/app/portal/signup/actions.ts")).toMatch(/if \(isPlaceholderEmail\(email\)\) \{\s*return \{ error: "Enter a valid email address\." \}/);
    const linking = read("src/lib/supabase/accountLinking.ts");
    expect(linking.indexOf("isPlaceholderEmail(email)")).toBeLessThan(linking.indexOf("createAdminClient()", linking.indexOf("export async function linkGuestRecordsToAccount")));
    const checkout = read("src/lib/payments/checkoutService.ts");
    const fn = checkout.slice(checkout.indexOf("export async function initiateGatewayCheckout"));
    expect(fn.indexOf("isPlaceholderEmail(params.email)")).toBeGreaterThan(-1);
    expect(fn.indexOf("isPlaceholderEmail(params.email)")).toBeLessThan(fn.indexOf("getActiveCountryConfig("));
    expect(read("src/lib/directory/emails.ts")).toContain("if (isPlaceholderEmail(e)) return null;");
  });
  it("the database keeps staff-recorded placeholders unique", () => {
    expect(migration).toContain("create unique index enquiries_placeholder_email_uniq on public.enquiries (lower(email)) where created_by is not null and lower(email) like '%@no-email.invalid';");
    expect(rollback).toContain("drop index public.enquiries_placeholder_email_uniq;");
  });
  it("the enquiry list and page show a placeholder as 'No email on file'", () => {
    expect(read("src/app/admin/enquiries/page.tsx")).toContain("displayEmail(e.email)");
    expect(read("src/app/admin/enquiries/[id]/page.tsx")).toContain("displayEmail(enquiry.email)");
  });
});

describe("a manually recorded enquiry cannot book, pay, issue or notify by itself", () => {
  it("the only code that writes a stage 'booked' is unchanged and is not called from M1 code", () => {
    for (const f of ["src/lib/enquiry/staffIntakeService.ts", "src/lib/commercial/quotationAcceptance.ts", "src/app/admin/enquiries/staffIntakeActions.ts", "src/app/admin/organisations/contractingActions.ts"]) {
      const src = code(read(f));
      expect(src, f).not.toMatch(/advanceStageOnFullPayment|crmStageSync|updateStageAction|crm_stage: "booked"|status: "sent"|issueCrewSupportQuotation|createClientQuotation/);
    }
  });
  it("no database trigger or default turns an inserted enquiry into a booking, payment or quotation", () => {
    expect(code(migration)).not.toMatch(/crm_stage|amount_due|amount_paid|payment_status|insert into public\.(payments|client_quotations)/i);
    expect(migration).not.toMatch(/create trigger[^;]*(payments|client_quotations)/i);
  });
});
