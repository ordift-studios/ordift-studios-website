import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Enquiry-to-booking M2a — architectural guarantees of the APPLICATION layer, checked by reading the actual source (the services are database-dependent from their
// first line, the same limitation documented across this codebase). The behaviour itself is exercised against a throwaway local database by
// amountDue.localdb.e2e.ts and scripts/m2a-local/*.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Assertions about what code DOES ignore explanatory comments (which rightly name the things the code must not do).
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const importsOf = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`export async function ${name}\\b`));
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const next = src.slice(start + 10).search(/\nexport (async )?function /);
  return src.slice(start, next === -1 ? undefined : start + 10 + next);
}

const rules = read("src/lib/commercial/amountDueRules.ts");
const amountDue = read("src/lib/commercial/amountDue.ts");
const gate = read("src/lib/commercial/contractingEntityGate.ts");
const actions = read("src/app/admin/enquiries/[id]/amountDueActions.ts");
const forms = read("src/app/admin/enquiries/[id]/AmountDueForms.tsx");
const panel = read("src/app/admin/enquiries/[id]/QuotationAmountPanel.tsx");
const register = read("src/app/admin/enquiries/overrides/page.tsx");
const quotations = read("src/lib/commercial/clientQuotations.ts");
const acceptance = read("src/lib/commercial/quotationAcceptance.ts");
const enquiryActions = read("src/app/admin/enquiries/actions.ts");
const enquiryPage = read("src/app/admin/enquiries/[id]/page.tsx");
const newPage = read("src/app/admin/pricing/quotations/new/page.tsx");

const M2A_MODULES = { rules, amountDue, gate, actions, forms, panel } as const;

describe("establishing, overriding and linking send nothing and create nothing financial", () => {
  it("no M2a module imports email, notification, spreadsheet, payment-processing, booking or Crew Support code", () => {
    const forbidden = /(email|notification|dispatch|lifecycle|sheets|whatsapp|crewSupport|payments\/(checkout|gateway|crmStage|bankTransfer|webhook|receipt|payout)|workflow\/stage|booking)/i;
    for (const [name, src] of Object.entries(M2A_MODULES)) {
      const bad = importsOf(src).filter((i) => forbidden.test(i));
      expect(bad, `${name} imports ${bad.join(", ")}`).toEqual([]);
    }
  });
  it("the only payment-related import is the permission matrix", () => {
    const paymentImports = importsOf(amountDue).filter((i) => /payments/.test(i));
    expect(paymentImports).toEqual(["@/lib/payments/paymentPermissions"]);
  });
  it("no M2a module writes a stage, a payment, an obligation, an engagement or a booking, or calls a mail or notification function", () => {
    for (const [name, src] of Object.entries(M2A_MODULES)) {
      const c = code(src);
      expect(c, name).not.toMatch(/crm_stage|crmStage\s*[:=]|payment_obligations|engagements|\.from\(["']payments["']\)|payment_status|booked/);
      expect(c, name).not.toMatch(/sendEmail|dispatchNotification|sendQuotationReadyEmail|sendBookingConfirm|logAndSend|resend/i);
    }
  });
  it("amountDue.ts performs no direct table write at all: every change goes through one database function", () => {
    const c = code(amountDue);
    expect(c).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(c).toMatch(/rpc\("establish_enquiry_amount_due"/);
    expect(c).toMatch(/rpc\("override_enquiry_amount_due"/);
  });
  it("the enquiry-page actions only call the library functions, which authorise first", () => {
    const c = code(actions);
    expect(c).not.toMatch(/createAdminClient|createClient\(/);
    expect(importsOf(actions).sort()).toEqual(["@/lib/commercial/amountDue", "@/lib/commercial/clientQuotations", "@/lib/shared/actionState", "next/cache"].sort());
  });
});

describe("every entry point authorises before it touches data", () => {
  for (const name of ["getAmountDuePanel", "establishAmountDue", "overrideAmountDue", "listAmountEvents"]) {
    it(`${name}: getCurrentUser() comes before any database access`, () => {
      const body = code(fnBody(amountDue, name));
      const auth = body.indexOf("getCurrentUser()");
      const firstDb = body.search(/createAdminClient\(\)|createClient\(\)|\.rpc\(/);
      expect(auth, "checks the signed-in user").toBeGreaterThan(-1);
      expect(firstDb).toBeGreaterThan(auth);
    });
  }
  it("override is Super Admin only and re-checks the amount permission", () => {
    const body = code(fnBody(amountDue, "overrideAmountDue"));
    expect(body).toMatch(/!isSuperAdmin\(user\)/);
    expect(body).toMatch(/canManageAmount\(user\)/);
  });
  it("establish needs the manage-project-amount permission; the register needs Super Admin", () => {
    expect(code(fnBody(amountDue, "establishAmountDue"))).toMatch(/!canManageAmount\(user\)/);
    expect(code(fnBody(amountDue, "listAmountEvents"))).toMatch(/!isSuperAdmin\(user\)/);
    expect(register).toMatch(/!isSuperAdmin\(user\)\) redirect/);
  });
  it("attach and revise authorise through the quotation library's admin check first", () => {
    for (const name of ["attachQuotationToEnquiry", "reviseClientQuotation"]) {
      const body = code(fnBody(quotations, name));
      expect(body.indexOf("requireAdminActor()"), name).toBeGreaterThan(-1);
      expect(body.indexOf("requireAdminActor()"), name).toBeLessThan(body.search(/createAdminClient\(\)/));
    }
  });
});

describe("the non-USD safeguard stays until P1 is deployed", () => {
  it("the flag is false and establishAmountDue refuses a non-USD quotation BEFORE calling the database", () => {
    expect(rules).toMatch(/export const NON_USD_AMOUNT_DUE_ENABLED = false;/);
    const body = code(fnBody(amountDue, "establishAmountDue"));
    const gateAt = body.indexOf("NON_USD_AMOUNT_DUE_ENABLED");
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(body.indexOf(".rpc("));
    expect(body).toMatch(/non_usd_disabled/);
  });
});

describe("Production database permissions are respected", () => {
  // In Production, service_role cannot read these three (migration 0024), so they are read through the signed-in session, as the payments code already does.
  const DENIED = ["currencies", "exchange_rates", "current_exchange_rates", "payment_country_config"];
  const filesThatMustUseSession = { "amountDue.ts": amountDue, "quotations/new/page.tsx": newPage, "clientQuotations.ts": quotations };
  for (const [name, src] of Object.entries(filesThatMustUseSession)) {
    it(`${name} never reads ${DENIED.join(", ")} through the admin client`, () => {
      const c = code(src);
      for (const t of DENIED) {
        for (const m of c.matchAll(new RegExp(`(\\w+(?:\\(\\))?)\\s*\\.from\\(["']${t}["']\\)`, "g"))) {
          expect(m[1], `${name}: ${t}`).not.toMatch(/^(db|admin|createAdminClient\(\))$/);
        }
      }
    });
  }
  it("amountDue.ts reads those tables only through the session client", () => {
    const c = code(amountDue);
    expect(c).toMatch(/session\.from\("payment_country_config"\)/);
    expect(c).toMatch(/session\.from\("exchange_rates"\)/);
  });
});

describe("the contracting entity is explicit and a prerequisite", () => {
  it("the gate only asks whether a choice is RECORDED; it never infers or chooses", () => {
    const c = code(gate);
    expect(c).not.toMatch(/\.(insert|update|upsert|delete)\(|currency|country|nationality|location|suggest/i);
  });
  it("recording an acceptance for an enquiry-linked quotation is refused until an entity is recorded, before the status changes", () => {
    const c = code(acceptance);
    const gateAt = c.indexOf("hasContractingEntityRecorded(");
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(c.indexOf('status: "accepted"'));
    expect(c).toMatch(/q\.enquiry_id &&/);
  });
  it("establishing is refused without a recorded entity (in the screen rules and in the database function)", () => {
    expect(rules).toContain("contracting_entity_missing");
    expect(read("supabase/migrations/0166_m2a_quotation_amount_controls.sql")).toContain("ordift:contracting_entity_missing");
  });
});

describe("existing behaviour is preserved", () => {
  it("the typed amount-due action is refused for an enquiry with an active ordinary quotation, after the Crew Support check and before any write", () => {
    const body = code(fnBody(enquiryActions, "setAmountDueAction"));
    const crew = body.indexOf('"creative_crew_support"');
    const guard = body.indexOf("hasActiveOrdinaryQuotation(enquiryId)");
    expect(body, "fails closed if the check itself fails").toMatch(/catch \(error\) \{[\s\S]*Save failed[\s\S]*\}\s*if \(hasQuotation\)/);
    const write = body.indexOf('.from("enquiries")', guard);
    expect(crew).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(crew);
    expect(write).toBeGreaterThan(guard);
  });
  it("the typed action still advances a pre-quotation stage and emails for enquiries WITHOUT a quotation (unchanged code)", () => {
    const body = code(fnBody(enquiryActions, "setAmountDueAction"));
    expect(body).toContain('updates.crm_stage = "quotation_sent"');
    expect(body).toContain("sendQuotationReadyEmail");
  });
  it("the enquiry page hides the typed form for an enquiry with an active quotation and shows the panel", () => {
    expect(enquiryPage).toContain("QuotationAmountPanel");
    expect(enquiryPage).toMatch(/amountPanel\?\.activeQuotation/);
  });
  it("revision is one database call; the old separate header, lines and supersede writes are gone", () => {
    const body = code(fnBody(quotations, "reviseClientQuotation"));
    expect(body).toMatch(/rpc\("revise_ordinary_quotation"/);
    expect(body).not.toMatch(/\.(insert|update|delete)\(|insertQuotationItems|updateQuotationStatus/);
  });
  it("creating a quotation validates the currency and the enquiry link; a header left without lines is removed", () => {
    const body = code(fnBody(quotations, "createClientQuotation"));
    expect(body).toContain("currencyRefusal(");
    expect(body).toContain("enquiryLinkRefusal(");
    expect(body).toMatch(/\.delete\(\)\.eq\("id", quotation\.id\)\.eq\("status", "draft"\)/);
  });
});

describe("the screens protect against duplicate submission and mistakes", () => {
  it("every form uses the shared ActionForm and a pending-disabled SubmitButton", () => {
    const forms3 = (forms.match(/<ActionForm /g) ?? []).length;
    expect(forms3).toBe(3);
    expect((forms.match(/<SubmitButton /g) ?? []).length).toBe(3);
  });
  it("the establish form carries the PREVIEWED rate so a changed rate is refused", () => {
    expect(forms).toContain('name="expectedRateToUsd"');
    expect(forms).toContain('name="expectedRateEffectiveFrom"');
  });
  it("the override form needs the typed enquiry reference and the confirmation text says no email, stage change, booking, payment or obligation", () => {
    expect(forms).toContain('name="typedReference"');
    expect(forms).toMatch(/does not send an email, change the stage, or create a booking, payment or obligation/);
  });
  it("the panel is read-only apart from the three forms and never offers a booking, payment or stage control", () => {
    const c = code(panel);
    expect(c).not.toMatch(/UpdateStageForm|SetAmountDueForm|crm_stage|payment link|Mark as paid/i);
  });
});
