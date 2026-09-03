// Universal Payables System — client-safe payee-profile constants and
// pure logic (2026-09-04). Deliberately isolated from
// src/lib/payables/payeeProfiles.ts, which imports createAdminClient/
// logActivity/authority — all server-only, ultimately pulling in
// next/headers via src/lib/supabase/server.ts. Any of those exports
// reaching a "use client" component (as PAYEE_CATEGORIES did, via
// AddPayeeForm.tsx) bundles the ENTIRE importing module for the
// browser, since ES module bundling is per-module, not per-export —
// Turbopack correctly rejects that at build time ("You're importing a
// module that depends on next/headers... in the Pages Router" is its
// actual error text for this exact shape of mistake, caught live
// against Production, build dpl_5wdT5ytdBGMzQM7Q1AkJCtJjqaiM's
// follow-up, 2026-09-04 — never promoted, live site unaffected). This
// file has zero imports and is safe from both a Server Component and a
// Client Component; payeeProfiles.ts re-exports from here so its own
// server-side call sites are unaffected.

export const PAYEE_CATEGORIES = ["staff", "vendor", "contractor", "freelancer", "instructor", "talent", "consultant", "other"] as const;
export type PayeeCategory = (typeof PAYEE_CATEGORIES)[number];

// Pure — checked before any session/database call, both so a common
// mistake (nothing selected) fails instantly without a round-trip, and
// so this specific check is directly unit-testable. Also client-safe
// for the same reason as PAYEE_CATEGORIES above, though its current
// only caller (createPayeeProfileAction, a "use server" action) is
// server-side — kept here anyway since it has no server-only
// dependency of its own and belongs with the rest of this module's
// client-safe surface.
export function validateCreatePayeeProfileInput(params: { profileId: string; category: string }): { ok: true } | { ok: false; error: string } {
  if (!params.profileId) return { ok: false, error: "Select an existing account first." };
  if (!params.category) return { ok: false, error: "Select a category." };
  return { ok: true };
}
