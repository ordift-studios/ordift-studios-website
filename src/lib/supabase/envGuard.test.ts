import { describe, expect, it } from "vitest";
import { checkSupabaseEnvironment, isLocalUrl, keyMarker } from "./envGuard";
const jwt = (claims: Record<string, unknown>) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const LAB = jwt({ role: "service_role", ordift_env: "lab" }), REAL = jwt({ role: "service_role", iss: "supabase" });
describe("isLocalUrl / keyMarker", () => {
  it("recognises local addresses only", () => { for (const u of ["http://127.0.0.1:54996", "http://localhost:3000", "http://[::1]:1", "http://host.docker.internal:5", "http://lab.localhost:80"]) expect(isLocalUrl(u)).toBe(true); for (const u of ["https://abcd.supabase.co", "https://localhost.evil.com", "http://127.0.0.1.evil.com", undefined, "not a url"]) expect(isLocalUrl(u as string)).toBe(false); });
  it("reads the marker without verifying anything, and tolerates garbage", () => { expect(keyMarker(LAB)).toBe("lab"); expect(keyMarker(REAL)).toBeNull(); for (const k of [undefined, "", "abc", "a.b.c", "a..c"]) expect(keyMarker(k as string)).toBeNull(); });
});
describe("checkSupabaseEnvironment", () => {
  it("a lab key with a local URL, not production: fine (the lab)", () => { expect(checkSupabaseEnvironment({ url: "http://127.0.0.1:54996", key: LAB, siteEnv: undefined })).toEqual({ ok: true }); });
  it("a lab key next to a real project URL is refused (it could never authenticate, and must never be sent)", () => { const r = checkSupabaseEnvironment({ url: "https://abcd.supabase.co", key: LAB, siteEnv: undefined }); expect(r.ok).toBe(false); });
  it("a lab key in a production deployment is always refused, even with a local URL", () => { expect(checkSupabaseEnvironment({ url: "http://127.0.0.1:54996", key: LAB, siteEnv: "production" }).ok).toBe(false); expect(checkSupabaseEnvironment({ url: "https://abcd.supabase.co", key: LAB, siteEnv: "production" }).ok).toBe(false); });
  it("a production deployment pointing at a local address is refused; with a real URL and a real key it is accepted", () => { expect(checkSupabaseEnvironment({ url: "http://localhost:54321", key: REAL, siteEnv: "production" }).ok).toBe(false); expect(checkSupabaseEnvironment({ url: "https://abcd.supabase.co", key: REAL, siteEnv: "production" })).toEqual({ ok: true }); });
  it("an unmarked key against a local stack outside production is accepted (the project's own local Supabase)", () => { expect(checkSupabaseEnvironment({ url: "http://127.0.0.1:54321", key: REAL, siteEnv: undefined })).toEqual({ ok: true }); });
});
