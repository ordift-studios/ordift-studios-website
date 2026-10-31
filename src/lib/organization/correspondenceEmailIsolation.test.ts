import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// SIGNING-LINK AND AUTHENTICATION ISOLATION (static). The preferred correspondence email is for ORDINARY COMMUNICATION and the agreement Contact line only. These checks
// fail the build if login, password reset, signature or issuance code could ever start reading it, or if anything could write the Supabase Auth account email.
const root = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : walk(p)) : [p]; });
const src = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(root, f).replaceAll("\\", "/");
const read = (r: string) => readFileSync(join(root, r), "utf8");
const IMPORT = /from\s+["']@\/lib\/organization\/correspondenceEmail["']/;

describe("who may use the correspondence-email module", () => {
  it("only the people and onboarding screens, the people action, the two portal pages (and their card) and the Schedule A loader import it (plus tests)", () => {
    const importers = src.filter((f) => IMPORT.test(readFileSync(f, "utf8"))).map(rel).filter((f) => !/\.(test|e2e)\.tsx?$/.test(f) && !/\.localdb\.e2e\.ts$/.test(f)).sort();
    expect(importers).toEqual([
      "src/app/admin/organization/ContactEmailLines.tsx", // a TYPE-only import (the read-only lines component)
      "src/app/admin/organization/onboarding/[onboardingId]/page.tsx",
      "src/app/admin/organization/people/[id]/CorrespondenceEmailPanel.tsx",
      "src/app/admin/organization/people/[id]/actions.ts",
      "src/app/admin/organization/people/[id]/page.tsx",
      "src/app/portal/(dashboard)/OwnContactEmailsCard.tsx", // a TYPE-only import (the read-only portal card)
      "src/app/portal/(dashboard)/collaborator/page.tsx",
      "src/app/portal/(dashboard)/instructor/page.tsx",
      "src/lib/legal/instructorAgreements.ts",
    ]);
  });
});

describe("login, password reset, signing and issuance never use it", () => {
  const SECURITY_FILES = [
    "src/lib/legal/signatureEngine.ts", "src/lib/legal/agreementIssuance.ts", "src/lib/legal/vendorAgreementIssuance.ts",
    "src/app/portal/login/actions.ts", "src/app/portal/forgot-password/ForgotPasswordForm.tsx", "src/app/portal/reset-password/ResetPasswordForm.tsx", "src/app/portal/reset-password/parseRecoveryLink.ts",
  ];
  it("security files do not mention the correspondence email at all", () => {
    for (const f of SECURITY_FILES) expect(read(f), f).not.toMatch(/orrespondence/);
  });
  it("the instructor issue-for-signature path neither imports it nor reads it, and delivers each signing link to the ACCOUNT email", () => {
    const text = read("src/lib/legal/instructorAgreementIssuance.ts");
    expect(text).not.toMatch(IMPORT);
    const issue = text.slice(text.indexOf("export async function issueInstructorAgreement"));
    expect(issue.length).toBeGreaterThan(500);
    expect(issue).not.toMatch(/orrespondence/);
    expect(issue).toMatch(/admin\.auth\.admin\.getUserById\(profileId\)/);
    expect(issue).toMatch(/to: email,/);
  });
  it("the Schedule A refresh is the ONLY place the agreement reads the preference, and the master text and clauses are not touched by it", () => {
    const composer = read("src/lib/legal/instructorAgreementDocument.ts");
    expect(composer).not.toMatch(IMPORT);                                  // the composer is pure: it only prints the snapshot value
    expect(composer.match(/correspondenceEmail/g)?.length).toBeGreaterThan(0);
    expect(read("src/lib/legal/instructorMasterSections.ts")).not.toMatch(/orrespondence/);
  });
});

describe("the Supabase Auth account email is never written", () => {
  it("the module and its screens contain no Auth write", () => {
    const FILES = ["src/lib/organization/correspondenceEmail.ts", "src/app/admin/organization/ContactEmailLines.tsx", "src/app/admin/organization/people/[id]/CorrespondenceEmailPanel.tsx"];
    for (const f of FILES) expect(read(f), f).not.toMatch(/updateUserById|auth\.admin\.(create|delete|update)|auth\.updateUser|email_change|change_email/i);
    const action = read("src/app/admin/organization/people/[id]/actions.ts");
    const fn = action.slice(action.indexOf("export async function setCorrespondenceEmailAction"), action.indexOf("// Background screening decision"));
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).not.toMatch(/updateUserById|auth\.admin|auth\.updateUser/);
  });
  it("the account email is shown read-only: no input or form field is bound to it", () => {
    const panel = read("src/app/admin/organization/people/[id]/CorrespondenceEmailPanel.tsx");
    expect(panel).not.toMatch(/accountEmail/);                              // the panel never receives it except through the read-only lines component
    expect(read("src/app/admin/organization/ContactEmailLines.tsx")).not.toMatch(/<input|<textarea|<select|<form/);
  });
});

describe("the portal card shows only the signed-in person's own addresses, read-only", () => {
  const PAGES = ["src/app/portal/(dashboard)/collaborator/page.tsx", "src/app/portal/(dashboard)/instructor/page.tsx"];
  it("the portal pages pass the SESSION user, never a request parameter, and never use the admin-side viewer function", () => {
    for (const f of PAGES) {
      const text = read(f);
      expect(text, f).toMatch(/loadOwnContactEmails\(user\)/);
      expect(text, f).not.toMatch(/loadContactEmailsForViewer|setCorrespondenceEmail|searchParams|params\./);
    }
    expect(read(PAGES[1]).match(/<OwnContactEmailsCard/g)?.length).toBe(2); // both branches of the instructor page (with and without an engagement)
  });
  it("the loader uses the request-scoped client and selects the address only; the card has no form or input", () => {
    const mod = read("src/lib/organization/correspondenceEmail.ts");
    const body = mod.slice(mod.indexOf("export async function loadOwnContactEmails"), mod.indexOf("// ---", mod.indexOf("export async function loadOwnContactEmails")));
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/createClient\(\)/);
    expect(body).not.toMatch(/createAdminClient|auth\.admin|evidence_note|recorded_by|source/);
    expect(body).toMatch(/\.select\("email"\)/);
    expect(read("src/app/portal/(dashboard)/OwnContactEmailsCard.tsx")).not.toMatch(/<form|<input|<textarea|<select|<button|useActionState|"use client"|action=/);
  });
});
