import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// INDEPENDENT-INSTRUCTOR FRAMEWORK ISOLATION (static). Standards acknowledgement must never block or alter agreement signing, never reuse employee HR policy acknowledgement, and never touch the signature vault.
const root = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : walk(p)) : [p]; });
const src = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(root, f).replaceAll("\\", "/");
const read = (r: string) => readFileSync(join(root, r), "utf8");
const prod = (f: string) => !/\.(test|e2e)\.tsx?$/.test(f) && !/\.localdb\.e2e\.ts$/.test(f);

describe("the signing path is untouched", () => {
  it("the signature engine, signing page, agreement issuance and vault never mention the instructor framework", () => {
    const files = ["src/lib/legal/signatureEngine.ts", "src/lib/legal/signatureTokens.ts", "src/lib/legal/signatureEvidence.ts", "src/lib/legal/agreementIssuance.ts", "src/lib/legal/instructorAgreementIssuance.ts", "src/lib/signatures/vault.ts", "src/lib/signatures/vaultRules.ts"];
    for (const f of files) expect(read(f), f).not.toMatch(/lib\/instructors|instructor_standards|instructor_session_schedules|instructor_rights_matrix/);
    for (const f of src.map(rel).filter((x) => x.startsWith("src/app/legal/sign/") && prod(x))) expect(read(f), f).not.toMatch(/lib\/instructors|instructor_standards/);
  });
  it("the framework never reads or writes employee HR policy acknowledgements or the signature vault", () => {
    for (const f of src.map(rel).filter((x) => x.startsWith("src/lib/instructors/") && prod(x))) expect(read(f), f).not.toMatch(/from\s+["'][^"']*(policyAcknowledgements|signatures\/vault)["']|\.from\("(policy_acknowledgements|signature_assets|signature_use_approvals)"\)/);
  });
});

describe("who uses the framework", () => {
  it("only the shared assignment gate, the instructor onboarding page, the portal card and the two admin pages import the libraries", () => {
    const users = src.filter((f) => /from\s+["']@\/lib\/instructors\/(standards|assignments)["']/.test(readFileSync(f, "utf8"))).map(rel).filter(prod).sort();
    expect(users).toEqual([
      "src/app/admin/organization/instructor-assignments/actions.ts", "src/app/admin/organization/instructor-assignments/page.tsx",
      "src/app/admin/organization/instructor-standards/actions.ts", "src/app/admin/organization/instructor-standards/page.tsx",
      "src/app/admin/organization/onboarding/[onboardingId]/page.tsx",
      "src/app/portal/(dashboard)/instructor/InstructorStandardsCard.tsx", "src/app/portal/(dashboard)/instructor/page.tsx", "src/app/portal/(dashboard)/instructor/standardsActions.ts",
      "src/lib/workshops/instructorEligibility.ts",
    ].sort());
  });
  it("the framework is switched on only because migration 0180 is applied, and the gate only changes behaviour when it is on", () => {
    expect(read("src/lib/instructors/featureGate.ts")).toMatch(/INSTRUCTOR_FRAMEWORK_ENABLED = true/);
    expect(read("src/lib/workshops/instructorEligibility.ts")).toMatch(/if \(INSTRUCTOR_FRAMEWORK_ENABLED\) return instructorStandardsRefusal\(profileId\)/);
  });
  it("the migration grants nothing to signed-in roles, never deletes, and cannot adopt an incomplete text", () => {
    const m = read("supabase/migrations/0180_instructor_standards_and_assignments.sql");
    expect(m).toMatch(/revoke all on public\.instructor_standards_versions, public\.instructor_standards_acknowledgements, public\.instructor_session_schedules, public\.instructor_rights_matrix from anon, authenticated, service_role/);
    expect(m).not.toMatch(/grant [^;]*(delete|truncate)[^;]*to service_role/i);
    expect(m).toMatch(/like '%\[\[DECISION%'/);
    expect(m).toMatch(/not been acknowledged|has not acknowledged the adopted standards/);
  });
});
