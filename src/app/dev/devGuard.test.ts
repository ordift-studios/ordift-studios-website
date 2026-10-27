// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import DevLayout from "./layout";

afterEach(() => vi.unstubAllEnvs());

describe("development-only pages can never be exposed by a production release", () => {
  it("every /dev route is a 404 when NODE_ENV is production (all deployed builds)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DevLayout({ children: null })).toThrow(expect.objectContaining({ digest: expect.stringMatching(/404/) }));
  });
  it("it renders normally in local development", () => { vi.stubEnv("NODE_ENV", "development"); expect(DevLayout({ children: "x" })).toBeTruthy(); });
  it("every page under src/app/dev sits under that layout (no route group escapes it) and no page elsewhere links to /dev", () => {
    const root = path.join(__dirname); const pages: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { expect(f.startsWith("(")).toBe(false); walk(p); } else if (/^(page|route)\.tsx?$/.test(f)) pages.push(p); } };
    walk(root); expect(pages.length).toBeGreaterThan(0);
    const appRoot = path.join(__dirname, ".."); const offenders: string[] = [];
    const scan = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (p.startsWith(root)) continue; if (statSync(p).isDirectory()) scan(p); else if (/\.(tsx?|mdx?)$/.test(f) && !f.endsWith(".test.ts") && /["'`]\/dev\//.test(readFileSync(p, "utf8"))) offenders.push(p); } };
    scan(appRoot); expect(offenders).toEqual([]);
  });
});
