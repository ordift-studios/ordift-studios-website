# Locked Versions

Recorded at project scaffold time. Per the approved Phase 1A plan, versions are not
hardcoded/planned in advance — this file documents what was actually resolved and
installed, and is the source of truth going forward (alongside `package-lock.json`).

This file tracks **tool/dependency versions**. For the **product's own semantic
versioning policy**, see below.

---

## Product Versioning Policy (effective 2026-07-26, v1.0.0 forward)

Every feature belongs to a semantic version. No untagged production releases.
Related work is grouped into logical releases rather than shipped ad hoc —
each release gets a git tag, a `CHANGELOG.md` entry, and a `RELEASE_NOTES.md`
section before it's considered done.

**v1.0.0 — Ordift Studios Platform Foundation** (2026-07-26) is the first
release under this policy — see `RELEASE_NOTES.md` and `CHANGELOG.md`.
Everything built before it (the public website, Sanity CMS, Supabase auth,
Client Portal) predates formal versioning and is preserved as "Internal
Development History" in `CHANGELOG.md`/`MILESTONES.md` — those earlier
version labels ("1.0" through "4.0") were informal and were never git tags.

**`v1.0.0-lc1`** (2026-07-27) — tags the commit where Version 1.0 feature
implementation was declared complete and the architecture frozen. Marks
entry into **Launch Candidate 1 (LC1)**: production readiness, UI/UX
refinement, content population, performance, accessibility, SEO,
responsiveness, and launch QA against what's already built — no new
major systems, portals, databases, schemas, or infrastructure unless a
critical defect requires one. See `MILESTONES.md`'s freeze banner and
`LAUNCH_CANDIDATE_1.md` for the phase-by-phase plan.

**Roadmap from v1.0.0 forward:** superseded 2026-07-27 by
**`PRODUCT_ROADMAP.md`**, now the single authoritative long-term plan —
see that document for the current version list (Version 1.1 Internal
Organization, 1.2 People & Skills, 2.0 Talent Management, 3.0 Studio
Operations, 4.0 Business Intelligence & Ordift Pulse) with full
vision/objectives/features/dependencies/risks/release-criteria per
version. The illustrative table that used to live here (Client
Experience, Scheduling & Calendar, CRM & Client Timeline, Finance &
Invoicing, AI Assistant, Multi-business Ecosystem) is retired — none of
those groupings were ever built under those names, and `PRODUCT_ROADMAP.md`
reflects what's actually planned now. The versioning *policy* above
(semver, git tags, `CHANGELOG.md`/`RELEASE_NOTES.md` entries) is
unchanged and still applies to every future release.

**Frozen baseline as of v1.0.0** (do not refactor without a genuine
architectural need from a future feature — full detail in `MILESTONES.md`):
infrastructure, authentication, Supabase schema, migration workflow, RLS
policies, business-scoped architecture, feature flag system, activity log,
deployment workflow, Admin Platform Tier 1.

| Tool | Version | Installed via |
|---|---|---|
| Node.js | v24.18.0 (Active LTS) | `nvm install --lts` |
| npm | 11.16.0 | bundled with Node install |
| nvm | 0.40.1 | official install script (nvm-sh/nvm) |
| Next.js | 16.2.11 | `create-next-app@latest` |
| React | 19.2.4 | installed by create-next-app |
| Tailwind CSS | v4 (CSS-first config, no `tailwind.config.js`) | `create-next-app --tailwind` |
| TypeScript | ^5 | `create-next-app --typescript` |

Exact pinned versions live in `package-lock.json` — do not hand-edit dependency
versions without updating both this file and the lockfile together.

## Known npm audit findings (as of scaffold time)

`npm audit` reports 3 vulnerabilities (1 moderate, 2 high) in `postcss` and `sharp`,
both **nested inside Next.js's own bundled dependencies** (not top-level deps we
chose). npm's suggested automated fix would downgrade `next` to `9.3.3` — a major
regression — so it was **not** applied. These are build/server-time image-processing
and CSS-stringification libraries; re-check `npm audit` after each Next.js minor/patch
bump and take the real fix (an upstream Next.js patch) once available, rather than
the downgrade path.
