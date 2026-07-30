# Dependency Watchlist

**Established:** 2026-07-30, at your explicit request alongside the Version 1.0.5 integration-testing decision.

**Purpose:** a permanent, living record of dependency conflicts, experimental/bleeding-edge packages, upcoming breaking changes, deprecated libraries, framework compatibility issues, and recommended upgrade paths — so nothing in this category is rediscovered from scratch in a future session. Update this the moment something in this category is found, the same discipline as `TECHNICAL_DEBT_REGISTER.md`.

---

## Framework Baseline (context for everything below)

This project runs **Next.js 16.2.11** and **React 19.2.4** — both current-generation releases significantly newer than most training data or general documentation assumes (see `AGENTS.md`'s explicit warning to check `node_modules/next/dist/docs/` before writing Next.js-specific code). This is the root cause of most entries below: a genuinely new toolchain hasn't fully stabilized its ecosystem of compatible tooling yet.

## Active Dependency Conflicts

### DW-001 — `@vitejs/plugin-react` blocked by a Babel peer-dependency conflict
- **Packages involved:** `@vitejs/plugin-react` (wants `@babel/core@^7.29.0 || ^8.0.0-rc.1` via `@rolldown/plugin-babel`) vs. `@sanity/codegen`'s resolved `@babel/core@8.0.1`.
- **Impact:** blocks installing React Testing Library / jsdom for component-level tests. Cross-referenced as `TECHNICAL_DEBT_REGISTER.md` TD-011.
- **Workaround in place:** the Vitest unit-test layer (`vitest.config.ts`) runs in a `node` environment with no React plugin — unaffected, since the highest-priority initial tests (role/auth logic, rate limiting, idempotency) needed no component rendering.
- **Recommended path:** re-check periodically whether `@vitejs/plugin-react`/`@rolldown/plugin-babel` ships a version compatible with Sanity's pinned `@babel/core`, or evaluate `--legacy-peer-deps` only after confirming it doesn't destabilize Sanity Studio's own build.
- **Status:** Open, low severity, workaround in place.

## Deprecation Notices Observed

### DW-002 — `vite-tsconfig-paths` plugin is soft-deprecated in favor of native Vite support
- **What:** installing `vite-tsconfig-paths` (used by `vitest.config.ts` to resolve the `@/*` path alias) prints: *"Vite now supports tsconfig paths resolution natively via the `resolve.tsconfigPaths` option. You can remove the plugin and set `resolve.tsconfigPaths: true` in your Vite config instead."*
- **Impact:** none today — the plugin still works correctly (35/35 tests passing as of 2026-07-30). Purely a future-cleanup note.
- **Recommended path:** when `vitest.config.ts` is next touched for another reason, switch to `resolve.tsconfigPaths: true` and drop the plugin dependency entirely.
- **Status:** Open, cosmetic.

### DW-003 — `tsconfck@3.1.6` (transitive, via `vite-tsconfig-paths`) flagged unmaintained
- **What:** `npm install` reports `tsconfck@3.1.6: unmaintained` as a deprecation warning.
- **Impact:** none currently — it's a build-time-only transitive dependency, not reachable at runtime.
- **Recommended path:** resolves itself once DW-002 is addressed (removing `vite-tsconfig-paths` removes this transitive dependency too).
- **Status:** Open, cosmetic, tied to DW-002.

### DW-004 — Additional transitive deprecation notices surfaced in the first real CI run (2026-07-30)
- **What:** GitHub Actions' clean-environment `npm ci` (real CI run `30570600185`) surfaced deprecation warnings not visible in this project's already-populated local `node_modules`: `glob@10.5.0` (unmaintained, publisher recommends upgrading — pulled in transitively, not a direct dependency), `uuid@10.0.0` (deprecated in favor of `uuid@11`+, same transitive path as TD-006's `typeid-js`/`uuid` finding), `node-domexception@1.0.0` (recommends the platform-native `DOMException` instead). Also two Node.js runtime `DEP0040`/`DEP0169` warnings (`punycode` module, `url.parse()`) from GitHub's own runner tooling, not this project's code.
- **Impact:** none — all build-time/transitive, not reachable at runtime by untrusted input, consistent with TD-006's existing reasoning for the same `uuid` chain.
- **Recommended path:** monitor; no direct dependency to bump. Re-check each Quarterly review per `DEPENDENCY_WATCHLIST.md`'s standing cadence.
- **Status:** Open, cosmetic.

## npm audit Findings (security-relevant; full detail in `TECHNICAL_DEBT_REGISTER.md` TD-006)

31 advisories (6 moderate, 25 high) as of 2026-07-30, entirely in transitive dependencies (`sharp`'s inherited `libvips` CVEs, `smol-toml` via `@vercel/frameworks`, `uuid` via `typeid-js`). Every `npm audit fix` path requires a breaking major-version bump of either Next.js (an actual downgrade relative to what's installed) or Sanity — neither is a safe blind fix. See TD-006 for the non-reachability reasoning on why these are monitored rather than blocking.

## Version Currency (checked 2026-07-30 via `npm outdated`)

| Package | Current | Latest | Gap type | Recommendation |
|---|---|---|---|---|
| `@supabase/ssr` | 0.12.3 | 0.12.4 | Patch | Safe to bump opportunistically |
| `@supabase/supabase-js` | 2.110.8 | 2.111.0 | Minor | Safe to bump opportunistically |
| `next` | 16.2.11 | 16.2.12 | Patch | Safe to bump opportunistically |
| `eslint-config-next` | 16.2.11 | 16.2.12 | Patch | Bump alongside `next` to keep them matched |
| `next-sanity` | 13.2.1 | 13.2.3 | Patch | Safe to bump opportunistically |
| `resend` | 6.18.0 | 6.18.1 | Patch | Safe to bump opportunistically |
| `sanity` | 6.6.0 | 6.8.0 | Minor | Review changelog before bumping — Studio-facing, worth a staging smoke test first |
| `supabase` (CLI) | 2.109.1 | 2.110.0 | Minor | Safe to bump opportunistically |
| `react` / `react-dom` | 19.2.4 | 19.2.8 | Patch | Safe to bump opportunistically |
| `eslint` | 9.39.5 | 10.8.0 | **Major** | Do not blind-bump — ESLint 10 likely changes flat-config/rule behavior; needs a deliberate review pass, not a routine update |
| `typescript` | 5.9.3 | 7.0.2 | **Major (skips a major)** | Do not blind-bump — a jump this large needs its own deliberate compatibility pass against this codebase and every dependency's type definitions before adopting |
| `@types/node` | 20.19.43 | 26.1.2 | **Major** | Tied to the actual Node.js runtime version target — only bump alongside a deliberate Node version upgrade decision, not in isolation |

**General policy going forward:** patch/minor bumps are safe to apply opportunistically (e.g., during Workstream B's CI setup, or routine maintenance per `MAINTENANCE_SCHEDULE.md`). Major version bumps are never routine — each gets its own review, tested on staging first, the same discipline already applied to every migration and dependency decision throughout this project.

## Recommended Upgrade Cadence

Ties into `MAINTENANCE_SCHEDULE.md`'s Quarterly cadence (dependency upgrades already listed there): re-run `npm outdated` and `npm audit` each quarter, update this watchlist with what changed, and use it as the single source of truth for "is anything here now safe/necessary to address" rather than rediscovering the same findings repeatedly.

---

*Cross-references: `TECHNICAL_DEBT_REGISTER.md` (TD-006, TD-011), `AGENTS.md` (the bleeding-edge-toolchain warning this whole document is downstream of), `MAINTENANCE_SCHEDULE.md` (Quarterly dependency review), `PRODUCT_ROADMAP.md` (Version 1.0.5).*
