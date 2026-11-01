import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSION_RECORD_ERASURE_ENABLED } from "./erasureGate";
import { BASES } from "./permissionRecordErasure";
import { isKnownNonQatar } from "./subjectRules";

describe("controlled erasure of older client-permission records (dormant)", () => {
  const src = readFileSync(new URL("./permissionRecordErasure.ts", import.meta.url), "utf8");
  it("is OFF until migration 0183 is applied and authorised", () => { expect(PERMISSION_RECORD_ERASURE_ENABLED).toBe(false); expect(src).toContain("if (g) return g; const a = await authority(user)"); });
  it("never deletes, updates or uploads anything, and never touches storage: it only inserts policy and hold rows and calls the erasure function", () => {
    for (const bad of ["storage.from(", ".remove(", ".delete(", ".update(", ".upsert(", "sendEmail", "fetch("]) expect(src).not.toContain(bad);
    expect([...src.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort()).toEqual(["marketing_permission_record_erasure_check", "marketing_permission_record_redact"]);
    expect([...new Set([...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))].sort()).toEqual(["marketing_permission_job_holds", "marketing_permission_records", "portfolio_retention_policy"]);
  });
  it("no other code touches the evidence-file column, so a stored file cannot be orphaned or deleted outside this process", () => {
    const files = ["library.ts", "portalRequests.ts", "subjects.ts", "sourceFiles.ts"];
    for (const f of files) expect(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).not.toContain("evidence_storage_path");
  });
  it("offers exactly the four recorded bases", () => { expect(BASES.map((b) => b.key)).toEqual(["retention_period_ended", "data_subject_request", "legal_requirement", "other_documented"]); });
  it("an unknown or Qatar origin is never treated as outside Qatar", () => { expect(isKnownNonQatar("ghana")).toBe(true); expect(isKnownNonQatar("other")).toBe(true); for (const v of ["qatar", "Qatar", "", null, undefined, "doha", "GHANA"]) expect(isKnownNonQatar(v as never)).toBe(false); });
});
