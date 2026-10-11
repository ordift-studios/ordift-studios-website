import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Next.js refuses to build when a "use server" file exports anything that is not an async function
// (a constant, a class, a sync function). TypeScript, ESLint and unit tests do not notice — only
// `next build` does — so this guards the rule statically for every server-action file.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|e2e)\./.test(name)) out.push(p);
  }
  return out;
}

describe('"use server" files export only async functions (types are fine)', () => {
  const files = walk("src").filter((f) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(readFileSync(f, "utf8")));
  it("finds the server-action files", () => expect(files.length).toBeGreaterThan(20));
  it("none exports a non-async value", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      // Values that can never be an action: literals/objects/arrays assigned to an exported const, any
      // let/var, classes, enums and synchronous function declarations. (An exported const that holds a
      // function — e.g. an action built by a helper — is allowed; it is a function at runtime.)
      if (/^export\s+const\s+\w+\s*(?::[^=\n]+)?=\s*(?:["'`\d\[{-]|true\b|false\b|null\b|new\b)/m.test(src)) offenders.push(`${f}: exported constant value`);
      for (const m of src.matchAll(/^export\s+(let|var|class|enum)\b/gm)) offenders.push(`${f}: export ${m[1]}`);
      if (/^export\s+function\b(?!\*)/m.test(src)) offenders.push(`${f}: sync function export`);
      if (/^export\s+default\s+(?!async\b)/m.test(src)) offenders.push(`${f}: default export is not an async function`);
    }
    expect(offenders).toEqual([]);
  });
});
