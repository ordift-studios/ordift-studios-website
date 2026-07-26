# Ordift Studios Platform — Development Guide

Status: **living document**, established 2026-07-26 alongside the `v1.0.0`
release, at your explicit request to define the engineering workflow for
all Tier 2+ development. This is the process contract from here forward —
update it deliberately (with a dated note) if the workflow itself changes,
not silently.

Related documents: `VERSIONS.md` (versioning policy detail), `MILESTONES.md`
(the versioned roadmap and frozen-baseline list), `RELEASE_NOTES.md` /
`CHANGELOG.md` (what shipped in each release), `STAGING.md` /`DEPLOYMENT.md`
(environment isolation and deploy mechanics), `ARCHITECTURE.md`
(architectural reasoning behind sequencing decisions).

---

## 1. Branching strategy

- **`main`** — always production-deployable. Every commit on `main` has
  passed the Testing Requirements (§5) and, for anything database-related,
  the Migration Policy (§6). Deploys to production automatically via
  Vercel.
- **Release tags** (`vX.Y.Z`) — mark a point on `main` as an official,
  documented release (see §3). Tags are permanent rollback points (§7) and
  are never moved or deleted once pushed.
- **Feature branches** — `feature/<version>-<short-name>`, e.g.
  `feature/v1.1.0-client-timeline`. Branched from `main`, merged back into
  `main` via pull request (§9) once complete and verified against staging.
  One feature branch per logical unit of work — don't bundle unrelated
  changes to avoid churn, per the standing "one bundled PR beats many small
  ones only when the work is genuinely one unit" judgment call.
- **No long-lived `staging` branch.** Staging is a separate Supabase
  project and a separate Vercel environment (`STAGING.md`), not a separate
  git branch — feature branches are verified against the staging
  *environment* directly (via preview deployments or local dev pointed at
  staging credentials) before merging to `main`.
- **Hotfix branches** — `hotfix/<short-name>`, branched from `main`, for
  production-only emergency fixes. Same testing bar as a feature branch,
  just expedited; still requires a PR, still gets its own patch version
  (§2) and tag.

## 2. Semantic versioning policy

Effective from `v1.0.0` (2026-07-26) — see `VERSIONS.md` for the full
policy statement. Summary:

- **Every feature belongs to a semantic version.** No untagged production
  releases.
- **MAJOR** (`vX.0.0`) — architectural changes to the frozen baseline
  (§ "Frozen baseline" in `MILESTONES.md`), or a genuinely breaking change
  to the platform's shape (e.g. multi-business ecosystem in `v2.0.x`).
- **MINOR** (`v1.X.0`) — a new feature area, built on the existing
  foundation without changing it. Matches the illustrative roadmap in
  `MILESTONES.md`/`VERSIONS.md` (`v1.1.x` Client Experience, `v1.2.x`
  Scheduling & Calendar, etc.).
- **PATCH** (`v1.1.X`) — bug fixes, small corrections, or non-breaking
  adjustments within an already-shipped minor version.
- Related work is grouped into one logical release rather than shipped ad
  hoc — a version closes when its full scope (as scoped at the start of
  that version) is built, verified, and documented, not when the first
  piece of it works.
- `package.json`'s `version` field, the git tag, the GitHub Release, and
  the `CHANGELOG.md`/`RELEASE_NOTES.md` entries must always agree — the
  Release Checklist (§3) exists specifically to keep these four in sync.

## 3. Release checklist

Run through this in order for every tagged release, not just major ones:

1. [ ] All feature branches for this version's scope are merged to `main`.
2. [ ] `main` passes the full Testing Requirements (§5): `tsc --noEmit`,
   `eslint .`, production `next build`, and live verification of every
   new/changed workflow.
3. [ ] Any new migrations are already applied to staging, verified, and
   promoted to production per the Migration Policy (§6) — never left
   pending at release time.
4. [ ] `package.json` version bumped per §2.
5. [ ] `CHANGELOG.md` — new entry at the top, following the existing
   entry format (what shipped, what's known-not-included, what's a known
   limitation).
6. [ ] `RELEASE_NOTES.md` — new detailed section for the release.
7. [ ] `MILESTONES.md` — checkboxes updated, version marked complete, any
   scope changes noted with a date.
8. [ ] Working tree clean, no temporary scripts/test data/debug code
   anywhere in the repo (same audit as performed for `v1.0.0`).
9. [ ] Commit the version bump + docs together as a single
   `chore(release): ...` commit.
10. [ ] Annotated git tag created (`git tag -a vX.Y.Z -m "..."`) on that
    commit, named to match the release.
11. [ ] Push the commit to `main`, then push the tag.
12. [ ] Create the GitHub Release from the tag (`gh release create`),
    title matching the release name, body = the new `RELEASE_NOTES.md`
    section, verified as published (not draft, not prerelease) and
    pointing at the intended commit.
13. [ ] Confirm the production deployment triggered by the `main` push
    succeeds (Deployment Checklist, §4).
14. [ ] Report the completed release to the stakeholder before starting
    the next version's work.

## 4. Deployment checklist

Run this after every push to `main` (whether or not it's a tagged
release), and explicitly again as the last step of a release:

1. [ ] Vercel deployment for the new commit reaches `Ready` — check build
   logs for warnings, not just the final status.
2. [ ] Deployed commit SHA matches `git rev-parse HEAD` for `main`.
3. [ ] Public site loads, zero console errors on a smoke-tested set of
   pages (home + at least one CMS-driven page).
4. [ ] `/admin` and `/portal/**` both reachable, auth redirect behavior
   correct for an anonymous visitor.
5. [ ] No new server/runtime errors in Vercel's function logs for the
   first few minutes of live traffic (or, pre-launch, for a manual
   exercise of the main flows).
6. [ ] If the change touched Sanity schema or GROQ queries: `/studio`
   loads, and CORS origins are already registered for this domain (see
   `DEPLOYMENT.md`).
7. [ ] If the change touched Supabase: confirm the correct project
   (staging vs. production) was targeted, and Security Advisor is still
   clean.
8. [ ] No regressions in features *not* touched by this change — spot-
   check at least one adjacent area (e.g. a schema change to Enquiries
   also gets a quick Client Portal check).

## 5. Testing requirements before every merge

Non-negotiable, in this order, before any PR merges to `main`:

1. **Static checks**: `npx tsc --noEmit` and `npx eslint .` both clean.
2. **Build**: a full production `next build` succeeds locally (catches
   issues `next dev`'s Turbopack cache can mask, and matches what Vercel
   actually runs).
3. **Live verification against staging** — not just local mock data:
   exercise every new/changed code path with real interaction (browser or
   API calls) against the staging Supabase project and staging Sanity
   dataset. This project's history has repeatedly found real bugs this
   way that unit-level reasoning alone missed (grant gaps, RLS policy
   gaps, middleware route-exemption gaps) — staging verification is not
   optional busywork.
4. **Test data hygiene**: any test accounts, rows, or temporary scripts
   created during verification are deleted before the branch is
   considered ready to merge — never left for "someone to clean up
   later."
5. **Role/permission boundary check**: for anything touching auth, RLS,
   or the Admin Platform, explicitly verify both the allowed case (the
   right role can do the thing) and the denied case (every other role
   cannot) — a feature that only tests the happy path is not done.
6. **No regressions**: re-check at least the adjacent existing features,
   per the Deployment Checklist's regression step — this is checked twice
   (pre-merge and post-deploy) deliberately, since a passing pre-merge
   check doesn't guarantee the deployed build behaves identically.

## 6. Database migration policy

Unchanged from the policy established during Supabase CLI setup and
reaffirmed at the Infrastructure Phase 1 freeze — this is part of the
frozen baseline, not open for reinterpretation per-feature:

- **Migrations are immutable, versioned infrastructure.** Once a
  migration file has been applied anywhere (even just staging), it is
  never edited again. Every schema change — however small — is a new,
  sequentially-numbered migration file.
- **Staging first, always.** Apply to the staging Supabase project,
  verify fully (Security Advisor clean, live E2E check of the affected
  workflow), only then promote the identical migration file to
  production.
- **Never edit production directly**, except as a documented emergency
  fix — and even then, the fix still gets written back as a proper
  migration afterward so the migration history stays the source of
  truth.
- **Reconcile migration history before pushing new migrations** if
  `supabase migration list` ever disagrees with what's actually live
  (`supabase migration repair`) — verify against real database state
  first, never assume the CLI's history is correct without checking.
- **RLS from day one.** Every new table ships with Row Level Security
  enabled and policied in the same migration that creates it — never
  added later as a follow-up.
- **Explicit grants, no defaults.** Every table-level and function-level
  grant is explicit and audited in the migration itself — never rely on
  Supabase's "automatically expose new tables" default (production has
  this disabled; migrations must work correctly under the strict
  profile, which is the more correct one).
- **`business_id` on every new table**, defaulted via
  `ordift_studios_business_id()`, per the multi-business-ready
  architecture — even for features that are Ordift-Studios-only today.

## 7. Rollback procedure using v1.0.0

`v1.0.0` is the permanent rollback point for the platform — the last
known-good state before any Tier 2 feature work began.

**Application code rollback:**
1. Identify the bad commit(s) on `main` since `v1.0.0`.
2. `git revert` the specific bad commit(s) (preferred — preserves
   history) or, if a full reset to `v1.0.0` is genuinely required,
   confirm with the stakeholder first (this is a destructive operation
   on a shared branch) before `git reset`/force-push.
3. Push the fix/revert to `main`; Vercel redeploys automatically.
4. Re-run the Deployment Checklist (§4) against the rolled-back state.

**Database rollback:** migrations are forward-only (§6) — there is no
"undo migration" step. Rolling back a schema change means writing a new,
forward-only migration that reverses the effect (e.g. drops the column a
previous migration added), applied staging-first as normal. If a bad
migration has already altered production data in a way a schema-only
reversal can't fix, that is a data-recovery situation — stop, assess
actual data impact, and get explicit direction before writing corrective
SQL against production.

**Full environment rollback:** if `main` itself needs to return to
exactly the `v1.0.0` state (not just revert a bad feature), check out the
tag directly (`git checkout v1.0.0`) to inspect or branch from it — never
force-push over `main`'s existing history without explicit approval,
since that discards every commit since the tag for anyone else with the
repo cloned.

## 8. Commit message conventions

Conventional Commits, matching the pattern already established across
this repository's history:

```
<type>(<scope>): <short summary, imperative mood>
```

- **Types**: `feat` (new feature), `fix` (bug fix), `chore` (tooling,
  dependency, release prep — no user-facing behavior change), `docs`
  (documentation only), `refactor` (no behavior change), `test`
  (test-only changes).
- **Scope**: the area touched — matches this project's existing scopes
  (`admin`, `db`, `forms`, `sanity`, `portal`, `release`, etc.) or a new
  one if the area is genuinely new.
- **Summary**: imperative mood ("add", not "added"/"adds"), no trailing
  period, states *what* changed.
- **Body** (optional, for anything non-obvious): explain *why*, not
  *what* — the diff already shows what changed.
- **One logical change per commit.** Don't batch unrelated changes
  (schema + UI + docs for unrelated features) into one commit — this
  project's history of atomic, independently-revertible commits (e.g.
  the 10 separate Admin Platform module commits) is deliberate and
  should continue.
- Every commit authored with Claude's assistance carries the
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer, per
  standing tooling convention.

## 9. Pull request checklist

Every feature/hotfix branch merges via PR, even for a single-developer
workflow — the PR description is the record of what was verified:

1. [ ] Title matches the commit convention (§8): `<type>(<scope>): <summary>`.
2. [ ] Description states what changed and why, and links the
   `MILESTONES.md` task/version it belongs to.
3. [ ] Testing Requirements (§5) all checked off, with a note on what was
   verified against staging (not just "tests pass").
4. [ ] Any new migrations listed explicitly, with confirmation they were
   staging-verified per the Migration Policy (§6).
5. [ ] Screenshots or a brief description of the verified UI, for
   anything user-facing.
6. [ ] No unrelated changes bundled in (formatting-only diffs on
   untouched files, unrelated dependency bumps, etc.).
7. [ ] `CHANGELOG.md`/`RELEASE_NOTES.md`/`MILESTONES.md` updates included
   if this PR completes a version (or a placeholder note if the version
   spans multiple PRs).
8. [ ] Self-reviewed diff before requesting review — check for anything
   that might reveal secrets, same as the release-commit staging step.

## 10. Documentation standards

- **Zero-invention policy applies to documentation too.** Never document
  a capability, integration, or result that wasn't actually built and
  verified — this has been the standing rule for site content and
  applies equally to release notes and milestone tracking.
- **Every release updates four files together**: `CHANGELOG.md` (dated,
  concise log entry), `RELEASE_NOTES.md` (detailed per-release section),
  `MILESTONES.md` (roadmap checkboxes + freeze/scope notes), and this
  `DEVELOPMENT_GUIDE.md` only if the *process itself* changed.
- **Historical entries are never rewritten**, only appended to or
  reframed with an explanatory note (as done when pre-`v1.0.0` history
  was folded into "Internal Development History") — the record of what
  actually happened and when stays intact.
- **Every doc names its own status** at the top (living document, status
  date, what supersedes what) so a future reader — human or AI — doesn't
  have to guess whether it's current.
- **Cross-reference instead of duplicating.** If detail already lives in
  another doc (e.g. environment variables in `DEPLOYMENT.md`,
  architecture reasoning in `ARCHITECTURE.md`), link to it rather than
  copying it — duplicated detail drifts out of sync silently.
- **Comments in code stay rare** — only for non-obvious *why*, matching
  the project's existing code style; documentation of *what* belongs in
  these markdown files and PR descriptions, not code comments.
