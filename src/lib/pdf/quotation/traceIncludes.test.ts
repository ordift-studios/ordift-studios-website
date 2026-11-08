import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The quotation PDF route reads its letterhead image and icons from public/ with a path built at run time, which the build's static file tracing cannot see. Without an explicit include, a deployed
// copy of the route prints the quotation with NO letterhead (render.ts tolerates a missing file). Verified in a full build: the route's trace lists these files only because of this setting.
describe("the deployed quotation PDF route carries the files it reads at run time", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const render = readFileSync(join(process.cwd(), "src/lib/pdf/quotation/render.ts"), "utf8");
  it("every public/ file render.ts reads is listed for the route", () => {
    const read = [...render.matchAll(/"(public\/(?:brand|fonts)[^"]+)"/g)].map((m) => m[1]);
    expect(read.length).toBeGreaterThanOrEqual(4);
    const includes = config.match(/outputFileTracingIncludes:\s*\{([\s\S]*?)\n  \},/)?.[1] ?? "";
    expect(includes).toMatch(/quotations\/\*\/document/);
    for (const f of read.filter((x) => x.startsWith("public/brand"))) {
      const pattern = "./" + f.replace(/[^/]+$/, (n) => (f.includes("letterhead-icons/") ? "*.png" : n));
      expect(includes, f).toContain(pattern);
    }
  });
});
