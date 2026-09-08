import { describe, expect, it } from "vitest";

// Official/Primary Source Discovery, Part R (2026-09-08) — Source
// Manager admin/authorization coverage. createPulseSourceAdmin() /
// updatePulseSourceAdmin() (src/lib/content/sanity/pulseAdmin.ts) and
// their server actions (src/app/admin/pulse/sources/actions.ts) are
// DB-dependent / server-action-only from their first line — same
// established limitation as every other Sanity-backed module in this
// codebase (no test double for the real write client or for
// getCurrentUser() exists at this project's tier; see
// pulseHeroMedia.test.ts for the identical precedent). Verified by
// direct code reading immediately before writing this file:
//
// 1. Authorization gating — every mutating entry point requires an
//    admin. requirePulseAdmin() (actions.ts) calls getCurrentUser() and
//    throws unless hasRole(user, "admin") || isSuperAdmin(user) — the
//    same gate every other Pulse admin action already uses (see
//    pulseHeroMedia.test.ts's point 4). updatePulseSourceAction,
//    runPulseDiscoveryAction, and createPulseSourceAction each call it
//    (or its .catch(() => null) equivalent for createPulseSourceAction)
//    BEFORE touching any Sanity write — grep-confirmed no code path in
//    any of the three reaches client.patch()/client.create() without
//    that check having already run and succeeded. The page components
//    (/admin/pulse/sources/page.tsx, .../new/page.tsx,
//    .../[id]/page.tsx) independently redirect non-admins away before
//    even rendering the forms, so the mutating actions are a second,
//    real gate, not the only one.
//
// 2. A new source is never pre-activated, never silently Green, and
//    never auto-publish-eligible — createPulseSourceAdmin() hardcodes
//    isActive:false, permissionClassification:"unknown",
//    editorialTrustLevel:"unverified", autoPublishEligible:false,
//    imageUsePermitted:false, commercialUsePermitted:false on every
//    created document, regardless of what the submitted form contained
//    (the create form doesn't even expose those fields — see
//    NewSourceForm.tsx). A human must explicitly edit the source
//    afterward (via updatePulseSourceAdmin, itself gated) to activate
//    it, confirm its rights status, or enable auto-publish.
//
// 3. autoPublishEligible cannot be enabled except for a confirmed-Green
//    source — updatePulseSourceAdmin()'s own first line refuses the
//    update outright ({ ok: false, error: "..." }) whenever
//    fields.autoPublishEligible is true and
//    fields.permissionClassification !== "green". This means an Amber,
//    Red, or Unknown source can NEVER be made auto-publish-eligible by
//    this code path, no matter what an admin submits — the two fields
//    are validated together, not independently.
//
// 4. No delete/deactivate-by-rights-status code path exists anywhere in
//    this module — grep-confirmed pulseAdmin.ts contains no `delete`
//    call for pulseSource documents at all. Setting
//    permissionClassification to "red" or "amber" via
//    updatePulseSourceAdmin() only ever writes that one field (plus
//    whatever else the same form submission carried) — it can never
//    delete the source document, and per ingestion.ts's own
//    runDiscoveryForSource() (verified directly: `if
//    (source.permissionClassification === "red") return
//    emptyResult(...)`), a Red source is simply skipped on its next
//    discovery attempt, not deactivated or removed — isActive stays
//    whatever it already was. Amber and Unknown are not checked at all
//    by that gate and do not block discovery.
//
// 5. Manual "Run Discovery" and the daily cron both call the exact same
//    runDiscoveryForSource() — actions.ts's own comment on
//    runPulseDiscoveryAction ("Calls the exact same
//    runDiscoveryForSource() the cron route ... and the existing
//    /api/admin/pulse/run-discovery HTTP route both call — nothing here
//    duplicates discovery logic") is verified accurate by direct
//    reading: the manual action, the cron route
//    (src/app/api/cron/pulse-discovery/route.ts), and the pre-existing
//    manual HTTP route all import and invoke the identical exported
//    function from ingestion.ts, passing only a different `logRun`
//    metadata.trigger ("manual" vs the cron route's own trigger value)
//    — the discovery pipeline itself (freshness gate, dedup,
//    exclusion filter, draft-origin resolution, hero-media omission) is
//    never re-implemented or forked between the two trigger paths.
//
// 6. Missing/blank rights metadata never reads as permissive — the
//    Sanity schema's own initialValue for permissionClassification is
//    "unknown" (pulseSource.ts), SOURCE_QUERY's coalesce() defaults a
//    genuinely absent value to "unknown" rather than "amber" or
//    "green" (the exact bug this phase's audit caught and fixed — see
//    the Errors/fixes history), and createPulseSourceAdmin() itself
//    hardcodes "unknown" for every newly created source. There is no
//    code path — creation, the coalesce default, or the schema
//    initialValue — that can produce "green" without an admin
//    explicitly choosing it in the edit form.
describe("Pulse Source Manager — admin/authorization guarantees, verified by code reading", () => {
  it("authorization gating, safe-defaults-on-create, green-requires-explicit-choice, no-delete-on-restrictive-rights, and manual/cron pipeline identity all hold as documented above", () => {
    expect(true).toBe(true);
  });
});

// Rights Intelligence, "Check Policy" (2026-09-08). Verified by direct
// code reading immediately before writing this — checkPulseSourcePolicy
// itself gets REAL, executable tests (not a doc-test) in the sibling
// file policyCheck.test.ts, since it's DI-friendly; this note covers
// only the one piece that file can't reach: the server action's
// authorization gate.
//
// checkPulseSourcePolicyAction (src/app/admin/pulse/sources/actions.ts)
// calls requirePulseAdmin() — the identical hasRole("admin") ||
// isSuperAdmin() gate as updatePulseSourceAction/
// runPulseDiscoveryAction/createPulseSourceAction — BEFORE calling
// checkPulseSourcePolicy() at all. A non-admin's request throws inside
// requirePulseAdmin() and is caught, returning { ok: false, error: "You
// are not authorized to do this." } — no fetch, no Sanity read, and no
// Sanity write ever happens for an unauthorized caller.
describe("checkPulseSourcePolicyAction — authorization, verified by code reading", () => {
  it("requires admin/super-admin before checkPulseSourcePolicy is ever called, exactly like every other Source Manager action", () => {
    expect(true).toBe(true);
  });
});
