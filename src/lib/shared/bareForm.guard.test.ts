import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { bareFormCount } from "./bareFormScan";
import { BARE_FORM_BASELINE } from "./bareFormBaseline";

// FORM-RESTORATION GUARD. React 19 resets every untouched field after a form action, including a REFUSED one, so a bare <form action={...}> loses what the person typed.
// Existing forms are on a ratchet (a baseline that may only go down); a NEW form must use <ActionForm> or useRestoringActionState (src/components/admin).
const root = process.cwd();
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (["node_modules", ".next", ".git"].includes(f) ? [] : walk(p)) : [p]; });
const files = walk(join(root, "src")).filter((f) => f.endsWith(".tsx") && !/\.(test|e2e)\./.test(f)).map((f) => relative(root, f).replaceAll("\\", "/"));

describe("bare forms may not grow", () => {
  it("no file has more bare forms than its baseline, and a new file has none", () => {
    const over = files.map((f) => ({ f, n: bareFormCount(readFileSync(join(root, f), "utf8")), allowed: BARE_FORM_BASELINE[f] ?? 0 })).filter((x) => x.n > x.allowed);
    expect(over.map((x) => `${x.f}: ${x.n} bare form(s), allowed ${x.allowed}. Use <ActionForm> or useRestoringActionState (src/components/admin/useRestoringActionState.ts).`)).toEqual([]);
  });
  it("the baseline is TIGHT: it equals the real count, so every conversion has to lower it (it cannot quietly drift)", () => {
    const drift = files.map((f) => ({ f, n: bareFormCount(readFileSync(join(root, f), "utf8")), allowed: BARE_FORM_BASELINE[f] ?? 0 })).filter((x) => x.n !== x.allowed);
    expect(drift.map((x) => `${x.f}: ${x.n} bare form(s) but the baseline says ${x.allowed}. Lower or remove the baseline entry.`)).toEqual([]);
  });
  it("the baseline only names files that exist (so it cannot hide a renamed file) and never lists a zero", () => {
    expect(Object.keys(BARE_FORM_BASELINE).filter((f) => !files.includes(f))).toEqual([]);
    expect(Object.values(BARE_FORM_BASELINE).filter((n) => n <= 0)).toEqual([]);
  });
  it("the forms converted in phases 1 and 2 use the restoring hook", () => {
    const uses = (f: string) => readFileSync(join(root, f), "utf8").includes("useRestoringActionState");
    for (const f of ["src/components/admin/OnboardingJourneyForms.tsx", "src/app/admin/organization/legal-entities/[entityId]/EntityRegistryPanels.tsx", "src/app/admin/organization/vendors/[vendorId]/VendorDetailWorkspace.tsx", "src/app/admin/portfolio-library/JobForms.tsx", "src/app/admin/pricing/quotations/[id]/QuotationStatusActions.tsx", "src/app/admin/enquiries/[id]/PricingForms.tsx", "src/app/admin/enquiries/[id]/SetAmountDueForm.tsx", "src/app/admin/pricing/TierRateEditForm.tsx", "src/app/admin/crew-support/ContractingEntityPanel.tsx", "src/app/admin/workshops/WorkshopForm.tsx", "src/app/admin/workshops/WorkshopScheduleForms.tsx"]) expect(uses(f), f).toBe(true);
  });
  it("the scanner counts a bare form and ignores a form with a ref, an ActionForm, and files without useActionState", () => {
    expect(bareFormCount(`useActionState(); <form action={a} className="x">`)).toBe(1);
    expect(bareFormCount(`useActionState(); <form ref={r} action={a}>`)).toBe(0);
    expect(bareFormCount(`useActionState(); <form onSubmit={(e) => go(e)} action={a}>`)).toBe(1);
    expect(bareFormCount(`<form action={a}>`)).toBe(0);
    expect(bareFormCount(`useActionState(); <ActionForm action={a}>`)).toBe(0);
  });
});
