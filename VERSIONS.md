# Locked Versions

Recorded at project scaffold time. Per the approved Phase 1A plan, versions are not
hardcoded/planned in advance — this file documents what was actually resolved and
installed, and is the source of truth going forward (alongside `package-lock.json`).

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
