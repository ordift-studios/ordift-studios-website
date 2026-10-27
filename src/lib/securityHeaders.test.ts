import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- the path-to-regexp copy bundled with Next (the matcher Next itself uses for header sources) ships no type declarations
import { match } from "next/dist/compiled/path-to-regexp";

// The rate card builder renders its PDF in the browser, which needs WebAssembly (the layout engine) and a blob: preview frame. Those two permissions must exist
// on exactly the builder route and nowhere else, and exactly ONE Content-Security-Policy header may apply to any path (two would be intersected, silently
// re-blocking the PDF engine).
type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(siteEnv: string | undefined): Promise<Rule[]> {
  vi.resetModules();
  if (siteEnv) vi.stubEnv("SITE_ENV", siteEnv); else vi.stubEnv("SITE_ENV", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "abc123");
  const mod = await import("../../next.config");
  const cfg = (typeof mod.default === "function" ? await (mod.default as never as (p: string, o: unknown) => Promise<unknown>)("phase-production-build", { defaultConfig: {} }) : mod.default) as { headers: () => Promise<Rule[]> };
  return cfg.headers();
}

const cspFor = (all: Rule[], path: string): string[] =>
  all.filter((r) => match(r.source)(path)).flatMap((r) => r.headers.filter((h) => h.key === "Content-Security-Policy").map((h) => h.value));

const directive = (csp: string, name: string) => (csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "").split(" ").slice(1);

afterEach(() => vi.unstubAllEnvs());

describe("Content-Security-Policy (production)", () => {
  const RATE_CARD = ["/admin/pricing/rate-card", "/admin/pricing/rate-card/anything"];
  const OTHERS = ["/", "/admin", "/admin/pricing", "/admin/payments", "/admin/pricing/rate-cards", "/admin/pricing/rate-card-old", "/journal", "/login"];

  it("applies exactly one CSP header to every path", async () => {
    const all = await rules("production");
    for (const p of [...RATE_CARD, ...OTHERS, "/studio/structure"]) expect(cspFor(all, p), p).toHaveLength(1);
    // "/studio" is matched by both Studio rules (existing, identical values), so it is checked as a single distinct policy.
    expect(new Set(cspFor(all, "/studio")).size).toBe(1);
  });

  it("grants WebAssembly, a blob: worker and a blob: frame on the rate card builder only", async () => {
    const all = await rules("production");
    for (const p of RATE_CARD) {
      const csp = cspFor(all, p)[0];
      expect(directive(csp, "script-src")).toContain("'wasm-unsafe-eval'");
      expect(directive(csp, "worker-src")).toEqual(["'self'", "blob:"]);
      expect(directive(csp, "frame-src")).toContain("blob:");
    }
    for (const p of [...OTHERS, "/studio"]) {
      const csp = cspFor(all, p)[0];
      expect(directive(csp, "script-src"), p).not.toContain("'wasm-unsafe-eval'");
      expect(directive(csp, "worker-src"), p).toEqual([]);
      expect(directive(csp, "frame-src"), p).not.toContain("blob:");
    }
  });

  it("never allows eval() / new Function() anywhere", async () => {
    const all = await rules("production");
    for (const r of all) for (const h of r.headers) if (h.key === "Content-Security-Policy") expect(h.value.replace("'wasm-unsafe-eval'", "")).not.toContain("'unsafe-eval'");
  });

  it("keeps every other protection on the builder route identical to the main policy", async () => {
    const all = await rules("production");
    const rc = cspFor(all, "/admin/pricing/rate-card")[0];
    const main = cspFor(all, "/admin/pricing")[0];
    // Remove only the three intended additions, each from its own directive; everything else must match the main policy exactly.
    const strip = (c: string) => c.split("; ").filter((d) => !d.startsWith("worker-src ")).map((d) => d.startsWith("script-src ") ? d.replace(" 'wasm-unsafe-eval'", "") : d.startsWith("frame-src ") ? d.replace(" blob:", "") : d).join("; ");
    expect(strip(rc)).toBe(main);
    expect(directive(rc, "img-src")).toEqual(directive(main, "img-src"));
    expect(directive(rc, "object-src")).toEqual(["'none'"]);
    expect(directive(rc, "frame-ancestors")).toEqual(["'self'"]);
    expect(directive(rc, "base-uri")).toEqual(["'self'"]);
    expect(directive(rc, "form-action")).toEqual(["'self'"]);
    expect(directive(rc, "connect-src")).toEqual(directive(main, "connect-src")); // not widened (no data:)
  });

  it("keeps the Studio policy unchanged", async () => {
    const all = await rules("production");
    const studio = cspFor(all, "/studio")[0];
    expect(directive(studio, "script-src")).not.toContain("'wasm-unsafe-eval'");
    expect(directive(studio, "frame-src")).toEqual(["'self'"]);
  });

  it("still sends the baseline security headers on the builder route", async () => {
    const all = await rules("production");
    const keys = all.filter((r) => match(r.source)("/admin/pricing/rate-card")).flatMap((r) => r.headers.map((h) => h.key));
    for (const k of ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) expect(keys).toContain(k);
  });
});

describe("Content-Security-Policy (local development)", () => {
  it("sends no CSP outside staging and production (unchanged behaviour)", async () => {
    const all = await rules(undefined);
    expect(all.flatMap((r) => r.headers).some((h) => h.key === "Content-Security-Policy")).toBe(false);
  });
});
