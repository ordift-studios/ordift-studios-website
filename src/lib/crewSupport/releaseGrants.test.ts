import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Production's service_role has NO privileges on deliverables, deliverable_categories or enquiry_notes
// (found 2026-10-11; see referenceTableAccess.test.ts). The release flow and the client download route must
// therefore reach those tables only through the signed-in user's session client (RLS), never the admin
// client — a lapse here passes every unit test and fails only in Production.
const FILES = ["src/lib/crewSupport/fileReleaseFlow.ts", "src/app/portal/(dashboard)/client/files/[fileId]/download/route.ts"];
const RESTRICTED = ["deliverables", "deliverable_categories", "enquiry_notes"];

describe("assignment release only reaches Production-restricted tables via the session client", () => {
  for (const file of FILES) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      for (const table of RESTRICTED) {
        for (const m of src.matchAll(new RegExp(`(\\w+(?:\\([^)]*\\))?)\\s*\\.from\\("${table}"\\)`, "g"))) {
          expect(m[1], `${table} must be read/written with the session client in ${file}`).toBe("supabase");
        }
      }
      expect(src).not.toMatch(/createAdminClient\(\)\s*\.from\("(deliverables|deliverable_categories|enquiry_notes)"/);
    });
  }
  it("the guard really sees the restricted tables in the release flow", () => {
    const src = readFileSync(FILES[0], "utf8");
    for (const table of RESTRICTED) expect(src).toContain(`from("${table}")`);
  });
});
