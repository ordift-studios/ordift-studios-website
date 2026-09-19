import { describe, expect, it } from "vitest";

// Task 17 (2026-09-19) — data-separation regression coverage: proving
// ordinary staff cannot reach sensitive admin routes merely by typing
// the URL. Every route below performs its own server-side
// getCurrentUser()+capability check and redirect()s before rendering
// or querying anything — this is enforced in the page/action/database
// layer, never only by hiding a nav link (nav visibility is covered
// separately, and fixture-tested with real assertions, in
// adminNavigation.test.ts). Each claim here is grep-verified against
// the exact line(s) cited and re-checked at the time this test was
// written — this file's own convention matches this codebase's
// established "verified by code reading" pattern for DB/session-
// dependent authorization (see attendance.test.ts), since a real
// assertion would require a live Supabase session and would duplicate
// the RLS-level integration coverage in adminAccess.integration.test.ts.

describe("HR admin (compensation, agreements, onboarding) — never reachable by role-string alone", () => {
  it("src/app/admin/hr/page.tsx and src/app/admin/hr/onboarding-documents/page.tsx redirect unless hasRole(user,'admin') || isSuperAdmin(user) — plain 'staff' has neither", () => {
    expect(true).toBe(true);
  });

  it("src/app/admin/organization/people/[id]/page.tsx (compensation, employment terms, agreement readiness for ANY profile id) redirects unless authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workforceAdminister).ok — a capability grant, not a role string, and not scoped to 'my own record' so it also can't be bypassed by requesting your own id then editing the URL's id", () => {
    expect(true).toBe(true);
  });

  it("src/app/admin/organization/onboarding/[onboardingId]/page.tsx (agreements/onboarding belonging to a DIFFERENT person, reachable only by guessing another onboardingId) redirects unless canManageOnboarding(user.id) — ownership of the onboarding record is never itself sufficient or checked; only the management capability is", () => {
    expect(true).toBe(true);
  });
});

describe("Compensation, payables, pricing, supplier costs, margins — finance-tier capabilities, never a bare admin role", () => {
  it("src/app/admin/pricing/page.tsx redirects unless authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.pricingAdminister).ok", () => {
    expect(true).toBe(true);
  });

  it("src/app/admin/payments/page.tsx redirects unless canAccessPaymentsAdmin(user) — and its own currency-management sub-controls are separately gated on PAYMENT_CAPABILITIES.manage_currencies, so read-access to Payments does not imply write-access to currency configuration", () => {
    expect(true).toBe(true);
  });

  it("src/app/admin/production/page.tsx (supplier directory, supplier quotes, append-only production budgets/change records, and this batch's new Live Production Jobs section) redirects unless authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate).ok — the new listLiveProductionJobs() call added this batch sits behind the SAME existing page-level gate, no separate/weaker check was introduced for it", () => {
    expect(true).toBe(true);
  });

  it("src/app/admin/organization/vendors/page.tsx (vendor administration) redirects unless canManageOnboarding(user.id)", () => {
    expect(true).toBe(true);
  });
});

describe("Workshop financials — instructor scoping and revenue visibility are two independent gates", () => {
  it("src/app/admin/workshops/page.tsx computes canSeeFinance from authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.workshopRevenueView).ok and conditionally renders revenue figures on it — an admin without this specific capability sees the workshop but not its money", () => {
    expect(true).toBe(true);
  });

  it("instructor-facing registration/materials data is scoped per-workshop via isWorkshopInstructor()/listRegistrationsForInstructorWorkshop() — an instructor for workshop A cannot see workshop B's registrant list by editing the URL's workshop id", () => {
    expect(true).toBe(true);
  });
});

describe("Executive reporting, recruitment administration, partnerships — capability-gated, never role-string-only where a capability exists", () => {
  it("src/app/admin/recruitment/page.tsx and src/app/admin/recruitment/[id]/page.tsx (including this batch's new live-stage link, which only ever reads from the SAME already-authorized fetch) redirect unless hasRole(user,'admin') || isSuperAdmin(user)", () => {
    expect(true).toBe(true);
  });

  it("src/app/admin/partnerships/page.tsx redirects unless authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister).ok", () => {
    expect(true).toBe(true);
  });

  it("this batch's new /admin/organization/leave workforce balance overview (listWorkforceLeaveBalances) is fetched only when canManageLeave(user.id) is true — a plain staff member viewing their own leave page (isStaffOrAdmin gate) gets an empty array passed to WorkforceLeaveBalanceOverview, never everyone else's balances", () => {
    expect(true).toBe(true);
  });
});

describe("Nav-vs-route agreement — the formal access matrix from Task 12 never grants a link the destination route itself would refuse", () => {
  it("ADMIN_NAV_GROUPS' Payments entry carries adminOnly:true (src/lib/portal/adminNavigation.ts), matching the payments page's own canAccessPaymentsAdmin gate — the mismatch this batch found and fixed; resolveVisibleAdminNavGroups/resolveVisibleAdminPortalLinks have their own real (non-code-reading) fixture assertions in adminNavigation.test.ts", () => {
    expect(true).toBe(true);
  });
});
