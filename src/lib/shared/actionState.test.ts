import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { actionFail, actionOk, runAction } from "./actionState";

describe("actionState helpers — the platform 'no silent consequential actions' contract", () => {
  it("success carries a message and failure carries an error, never both", () => {
    expect(actionOk("Saved.")).toEqual({ ok: true, message: "Saved." });
    expect(actionFail("Nope")).toEqual({ ok: false, error: "Nope" });
  });

  it("runAction returns the action's own result on success", async () => {
    expect(await runAction(async () => actionOk("Done."), "x")).toEqual({ ok: true, message: "Done." });
  });

  it("runAction turns a thrown error into a visible failure, never success", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await runAction(async () => {
      throw new Error("boom");
    }, "x");
    expect(state?.ok).toBe(false);
    spy.mockRestore();
  });
});

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, out);
    else if (/actions\.ts$|Actions\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// Regression guard for the audit rule: an action that returns ActionState
// must never log a failure and then fall through to a success return.
// (Workshop/portal actions use their own state shapes and are excluded.)
describe("converted actions never report success after a logged failure", () => {
  const files = listFiles("src/app/admin").filter((f) => readFileSync(f, "utf8").includes('from "@/lib/shared/actionState"'));
  const pat = /export async function (\w+Action)\(_prev: ActionState, formData: FormData\): Promise<ActionState> \{\n([\s\S]*?)\n\}\n/g;

  it("finds converted actions to check (guards against the scan silently matching nothing)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(pat)) {
      const [, name, body] = m;
      // Best-effort secondary logging that is intentionally non-fatal.
      const allowed = new Set(["decideProjectRequestAction", "recordPolicyAcknowledgementAction"]);
      it(`${file.replace("src/app/admin/", "")} › ${name}: every console.error is followed by a failure return`, () => {
        if (allowed.has(name)) return;
        for (const ce of body.matchAll(/console\.error\([^\n]*\);/g)) {
          const after = body.slice((ce.index ?? 0) + ce[0].length, (ce.index ?? 0) + ce[0].length + 140);
          expect(after).toMatch(/\s*return actionFail/);
        }
      });
    }
  }
});
