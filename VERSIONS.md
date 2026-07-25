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

**Roadmap from v1.0.0 forward** (illustrative — a planning guide, not a
fixed contract; groupings may shift as real requirements emerge, but every
shipped feature still lands in a tagged, documented version):

| Version | Focus |
|---|---|
| v1.1.x | Client Experience |
| v1.2.x | Scheduling & Calendar |
| v1.3.x | CRM & Client Timeline |
| v1.4.x | Finance & Invoicing |
| v1.5.x | AI Assistant |
| v2.0.x | Multi-business Ecosystem |

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
