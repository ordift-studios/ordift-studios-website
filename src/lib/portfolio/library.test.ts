import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let management = false;
let gateOn = false;
let approved = false;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => { calls.push(t); throw new Error("database touched: " + t); }, rpc: (n: string) => { calls.push(n); throw new Error("database touched: " + n); } }) }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/crewSupport/management", () => ({ isManagementUser: async () => management }));
vi.mock("./featureGate", () => ({ get PORTFOLIO_LIBRARY_ENABLED() { return gateOn; } }));
vi.mock("./permissionText", async (orig) => ({ ...(await orig<typeof import("./permissionText")>()), get PERMISSION_TEXT_APPROVED() { return approved; } }));

import * as lib from "./library";
const staff = { id: "u1", email: "s@x.test", fullName: "Staff", roles: ["staff"] } as unknown as Parameters<typeof lib.addPortfolioCandidates>[0];
const founder = { ...staff, id: "u2", roles: ["super_admin"] } as typeof staff;
const OK_REVIEW = { fileId: "f1", decision: "approved" as const, destinations: ["portfolio"], checks: { confidentiality: true, embargo: true, contractual_restrictions: true, release_rights: true, quality: true }, notes: "" };
const OK_PERM = { decision: "granted" as const, grantorName: "Synthetic Grantor", grantorCapacity: "client", destinations: ["portfolio"], fileIds: null, restrictions: "", expiresOn: "", method: "message", grantedOn: "", evidenceSummary: "message thread confirming the use", note: "", verified: false };

beforeEach(() => { calls.length = 0; management = false; gateOn = false; approved = false; });

describe("while the portfolio library is switched off, nothing touches the database", () => {
  it("every write and read refuses without a single query", async () => {
    const results = await Promise.all([
      lib.addPortfolioCandidates(founder, ["f1"], "picker"),
      lib.createCollection(founder, { name: "Weddings" }),
      lib.addFilesToCollection(founder, "c1", ["f1"]),
      lib.recordAdminPermission(founder, "crew_support_request", "j1", OK_PERM),
      lib.recogniseContractPermission(founder, "crew_support_request", "j1", { agreementId: "a1", clause: "4.1", destinations: ["portfolio"], grantorName: "G" }),
      lib.verifyPermission(founder, "crew_support_request", "j1", "r1", "checked"),
      lib.createPermissionRequest(founder, { jobType: "crew_support_request", jobId: "j1", addressedTo: "p1", destinations: ["portfolio"], fileIds: null }),
      lib.answerPermissionRequest("p1", "q1", { decision: "granted", destinations: ["portfolio"], restrictions: "", displayName: "C" }),
      lib.withdrawOwnPermission("p1", "r1", "C"),
      lib.recordInternalReview(founder, OK_REVIEW),
      lib.recordUse(founder, { fileId: "f1", destination: "portfolio", action: "published", reference: "x" }),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    expect(await lib.getStandings(["f1"])).toEqual({});
    expect(await lib.getJobPermissionView("engagement", "j1")).toBeNull();
    expect(await lib.listContractCandidates("engagement", "j1")).toEqual([]);
    expect((await lib.checkUseEligibility("f1", "portfolio")).eligible).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("authority and approval rules enforced before the database is reached", () => {
  it("only the Founder / executive admin can record, recognise, verify, request, review or record use", async () => {
    gateOn = true; approved = true; management = false;
    const rs = await Promise.all([
      lib.recordAdminPermission(staff, "crew_support_request", "j1", OK_PERM),
      lib.recogniseContractPermission(staff, "crew_support_request", "j1", { agreementId: "a1", clause: "4.1", destinations: ["portfolio"], grantorName: "G" }),
      lib.verifyPermission(staff, "crew_support_request", "j1", "r1", "checked"),
      lib.createPermissionRequest(staff, { jobType: "crew_support_request", jobId: "j1", addressedTo: "p1", destinations: ["portfolio"], fileIds: null }),
      lib.recordInternalReview(staff, OK_REVIEW),
      lib.recordUse(staff, { fileId: "f1", destination: "portfolio", action: "published", reference: "x" }),
    ]);
    for (const r of rs) { expect(r.ok).toBe(false); expect(r.ok === false && r.error).toMatch(/Founder or an authorised executive admin/); }
    expect(calls).toEqual([]);
  });
  it("incomplete evidence or checks are refused before the database", async () => {
    gateOn = true; management = true;
    expect((await lib.recordAdminPermission(founder, "crew_support_request", "j1", { ...OK_PERM, evidenceSummary: "x" })).ok).toBe(false);
    expect((await lib.recordInternalReview(founder, { ...OK_REVIEW, checks: { confidentiality: true } })).ok).toBe(false);
    expect((await lib.recogniseContractPermission(founder, "crew_support_request", "j1", { agreementId: "a1", clause: "", destinations: ["portfolio"], grantorName: "G" })).ok).toBe(false);
    expect((await lib.recogniseContractPermission(founder, "crew_support_request", "j1", { agreementId: "a1", clause: "4.1", destinations: ["billboard"], grantorName: "G" })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
  it("no client request can be created or answered until the Founder approves the wording", async () => {
    gateOn = true; management = true; approved = false;
    const a = await lib.createPermissionRequest(founder, { jobType: "crew_support_request", jobId: "j1", addressedTo: "p1", destinations: ["portfolio"], fileIds: null });
    const b = await lib.answerPermissionRequest("p1", "q1", { decision: "granted", destinations: ["portfolio"], restrictions: "", displayName: "C" });
    expect(a.ok === false && a.error).toMatch(/wording has not been approved/);
    expect(b.ok).toBe(false);
    expect(calls).toEqual([]);
  });
  it("a client must tick at least one use to agree (nothing is assumed)", async () => {
    gateOn = true; approved = true;
    const r = await lib.answerPermissionRequest("p1", "q1", { decision: "granted", destinations: [], restrictions: "", displayName: "C" });
    expect(r.ok === false && r.error).toMatch(/Tick at least one use/);
    expect(calls).toEqual([]);
  });
  it("staff may propose candidates (reaching the database) while the final decisions stay with the authority", async () => {
    gateOn = true; management = false;
    await expect(lib.addPortfolioCandidates(staff, ["f1"], "picker")).rejects.toThrow(/database touched: project_files/);
  });
});

describe("source guards", () => {
  const src = readFileSync(new URL("./library.ts", import.meta.url), "utf8");
  it("every exported function checks the feature gate", () => {
    const fns = [...src.matchAll(/export async function (\w+)\(([\s\S]*?)\n}\n/g)];
    expect(fns.length).toBeGreaterThan(10);
    for (const [, name, body] of fns) expect(body, name).toMatch(/gate\(\)|PORTFOLIO_LIBRARY_ENABLED/);
  });
  it("sends nothing and publishes nothing: no email, notification, CMS write or storage call", () => {
    for (const bad of ["sendEmail", "notify", "resend", "sanity", "createSignedUrl", ".storage", "fetch("]) expect(src.toLowerCase()).not.toContain(bad.toLowerCase());
  });
  it("never deletes or rewrites history: no update/delete calls except closing a request", () => {
    expect(src).not.toMatch(/\.delete\(|\.upsert\(/);
    expect(src.match(/\.update\(/g)).toBeNull();
  });
});

describe("nothing is preselected in any permission or approval form", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("no checkbox is ticked by default and the portal form never defaults to agreeing", () => {
    for (const f of ["../../app/admin/portfolio-library/JobForms.tsx", "../../app/portal/(dashboard)/permissions/Forms.tsx"]) {
      const s = read(f);
      const boxes = [...s.matchAll(/<input type="checkbox"[^>]*>/g)].map((m) => m[0]);
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) expect(b).not.toMatch(/defaultChecked|checked=/);
    }
    expect(read("../../app/portal/(dashboard)/permissions/Forms.tsx")).not.toMatch(/defaultChecked/);
  });
  it("the administrator form defaults evidence to NOT sufficient and never fills in a date", () => {
    const s = read("../../app/admin/portfolio-library/JobForms.tsx");
    expect(s).toMatch(/value="no" defaultChecked/);
    expect(s).not.toMatch(/name="grantedOn"[^>]*(defaultValue|value)=/);
  });
  it("the client portal page does not exist while the feature or the wording is off", () => {
    const p = read("../../app/portal/(dashboard)/permissions/page.tsx");
    expect(p).toContain("if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_TEXT_APPROVED) notFound();");
  });
  it("the final-approval gallery offers the candidate action only when the library is on, and it publishes nothing", () => {
    const g = read("../../app/admin/crew-support/AssignmentReviewGallery.tsx");
    expect(g).toMatch(/if \(PORTFOLIO_LIBRARY_ENABLED\) actions\.push/);
    expect(g).toContain("addCandidatesAction(ids, \"final_approval\")");
    expect(g).toContain("Nothing is delivered, published or shared");
  });
});
