import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ user: null as null | { id: string; roles: string[] }, set: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isStaffOrAdmin: (u: { roles: string[] } | null) => Boolean(u?.roles.some((r) => ["staff", "admin", "super_admin"].includes(r))), isSuperAdmin: (u: { roles: string[] } | null) => Boolean(u?.roles.includes("super_admin")) }));
vi.mock("@/lib/organization/policyAcknowledgements", () => ({ recordPolicyAcknowledgement: vi.fn() }));
vi.mock("@/lib/organization/onboardingRequirements", () => ({ resolveDeferredRequirementForProfile: vi.fn() }));
vi.mock("@/lib/notifications/preferences", async (orig) => ({ ...(await orig<typeof import("@/lib/notifications/preferences")>()), setNotificationPreference: (...a: unknown[]) => h.set(...a) }));
import { setOwnNotificationPreferenceAction } from "./actions";
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
beforeEach(() => { h.user = { id: "p2", roles: ["staff"] }; h.set.mockReset(); h.set.mockResolvedValue({ ok: true }); });

describe("a person's own 'bookings assigned to me' e-mail preference (reuses the existing self-service action)", () => {
  it("a staff member or Admin can switch it off and on, for THEMSELVES only (the form never carries a user id)", async () => {
    expect(await setOwnNotificationPreferenceAction(null, fd({ category: "assigned_booking", enabled: "false" }))).toEqual({ ok: true }); expect(h.set).toHaveBeenCalledWith("p2", "assigned_booking", false);
    h.user = { id: "a1", roles: ["admin"] }; await setOwnNotificationPreferenceAction(null, fd({ category: "assigned_booking", enabled: "true", userId: "someone-else" })); expect(h.set).toHaveBeenLastCalledWith("a1", "assigned_booking", true);
  });
  it("a client, a signed-out visitor and an unknown category are refused", async () => {
    h.user = { id: "c1", roles: ["client"] }; expect(await setOwnNotificationPreferenceAction(null, fd({ category: "assigned_booking", enabled: "false" }))).toMatchObject({ ok: false });
    h.user = null; expect(await setOwnNotificationPreferenceAction(null, fd({ category: "assigned_booking", enabled: "false" }))).toMatchObject({ ok: false });
    h.user = { id: "p2", roles: ["staff"] }; expect(await setOwnNotificationPreferenceAction(null, fd({ category: "everything", enabled: "false" }))).toMatchObject({ ok: false }); expect(h.set).not.toHaveBeenCalled();
  });
});
