// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { id: string; roles: string[] }, calls: [] as string[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isSuperAdmin: (u: { roles: string[] }) => u.roles.includes("super_admin") }));
vi.mock("@/lib/pdf/rateCard/editions", () => ({
  approveEdition: async (p: { deps?: unknown }) => { h.calls.push(`approve:${p.deps ? "deps" : "nodeps"}`); return { ok: true, contentSha256: "a".repeat(64), supersededEditionId: null }; },
  createDraft: async () => { h.calls.push("create"); return { ok: true, id: "e1" }; }, updateDraft: async () => { h.calls.push("update"); return { ok: true, updatedAt: "t" }; },
  startNextEdition: async () => { h.calls.push("next"); return { ok: true, id: "e2" }; }, getApprovedEditionForDownload: async () => { h.calls.push("download"); return { ok: false, error: "nope" }; },
}));
vi.mock("@/lib/pdf/rateCard/loaders", () => ({ buildDraftFromSellingRates: async (o: { currency?: string }) => { h.calls.push(`build:${o.currency}`); return { ok: true, draft: { meta: {}, sections: [], conditions: [], contact: [] } }; } }));
vi.mock("@/lib/organization/entityRegistrations", () => ({ getContractingEntityStanding: async () => null }));

import { approveEditionAction, buildDraftAction, downloadApprovedAction, saveNewDraftAction, startNextEditionAction, updateDraftAction } from "./actions";

beforeEach(() => { h.calls = []; h.user = null; });
const content = { meta: {}, sections: [], conditions: [], contact: [] } as never;

describe("rate card actions: Super Admin only", () => {
  it("refuse signed-out users and non-Super-Admins without reaching any edition or pricing code", async () => {
    for (const user of [null, { id: "u", roles: ["admin"] }]) {
      h.user = user;
      const rs = [await buildDraftAction({ marketSlug: "qatar", entityId: "", currency: "USD" }), await saveNewDraftAction(content), await updateDraftAction("e", content, "t"), await approveEditionAction("e", "qatar", null, "cleared by founder"), await startNextEditionAction("e", "N", "2026-11-01"), await downloadApprovedAction("e")];
      for (const r of rs) expect(r.ok).toBe(false);
    }
    expect(h.calls).toEqual([]);
  });
  it("a Super Admin reaches the edition module; approval is given the live-rate and licence checks; only USD or QAR can be built", async () => {
    h.user = { id: "u", roles: ["super_admin"] };
    expect((await buildDraftAction({ marketSlug: "qatar", entityId: "", currency: "EUR" })).ok).toBe(false);
    expect((await buildDraftAction({ marketSlug: "qatar", entityId: "", currency: "QAR" })).ok).toBe(true);
    expect((await approveEditionAction("e", "qatar", "ent", "cleared by founder")).ok).toBe(true);
    expect(h.calls).toEqual(["build:QAR", "approve:deps"]);
  });
});
