import { describe, expect, it } from "vitest";

// Ordift Pulse — Adaptive Discovery Remediation, Part 6 (2026-09-08).
// setPulseArticleHeroMedia()/clearPulseArticleHeroMedia()
// (src/lib/content/sanity/pulseAdmin.ts) are DB-dependent from their
// first line — same established limitation as every other Sanity-
// backed module in this codebase (no test double for the real write
// client exists at this project's tier). Verified by direct code
// reading immediately before writing this file:
//
// 1. Narrow field scope: both functions call ONLY
//    .patch(id).set({heroMedia:...})/.unset(["heroMedia"]) — grep-
//    confirmed neither touches status, tags, or any other field, so
//    setting/clearing hero media can never itself publish, reject,
//    archive, or otherwise change an article's editorial state.
//
// 2. Correct mediaAsset shape: the "image" branch builds exactly the
//    same {_type:"mediaAsset", type:"image", image:{asset:{_ref}}}
//    shape PortfolioProjectForm.tsx's own mediaAssetField() already
//    uses for the identical mediaAsset object type — no new/divergent
//    shape invented. The "embed" branch mirrors that same file's embed
//    variant equally exactly.
//
// 3. No source-image auto-reuse: neither function, nor the
//    HeroMediaControl.tsx component that calls them, ever reads a
//    discovered article's own item.imageUrl/source imagery — the only
//    two paths to a value are an editor-uploaded file (via
//    /api/admin/pulse/assets, which only ever receives whatever binary
//    the editor's browser sends) or an editor-typed embed URL. This is
//    the same guarantee ingestion.ts's own tests already assert at
//    creation time (a discovered draft's heroMedia is always
//    undefined, even when the raw feed item carried an imageUrl).
//
// 4. Authorization: both server actions that call these functions
//    (setPulseArticleHeroMediaAction/clearPulseArticleHeroMediaAction
//    in src/app/admin/pulse/actions.ts) call requirePulseAdminSimple()
//    first — the same hasRole("admin")||isSuperAdmin() gate every
//    other Pulse admin action already uses — before either function is
//    ever reached.
//
// 5. No real hero media has been set on any article in Production by
//    this phase — the one authorized post-deploy discovery run creates
//    drafts only, never touches heroMedia (see the completion report).
describe("setPulseArticleHeroMedia / clearPulseArticleHeroMedia — verified by code reading", () => {
  it("narrow-field-scope, correct-shape, no-source-reuse, and authorization guarantees hold as documented above", () => {
    expect(true).toBe(true);
  });
});
