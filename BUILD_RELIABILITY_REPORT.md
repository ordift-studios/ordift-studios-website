# Vercel build reliability — investigation and corrective measure (27 Nov 2026)

## What happened
Of the last three Production deployments, two failed on the first attempt and succeeded on retry of the same commit: one hung for 30 minutes at "Running TypeScript", one was killed (`Next.js build worker exited … SIGKILL`, Vercel's own report: out-of-memory event). Production was never affected (the previous deployment kept serving).

## Measurements (local, same code)
| | Before | After the change |
|---|---|---|
| Files the TypeScript program loads | 4,918 | 3,964 |
| Type-definition lines loaded from node_modules | 3,714,958 | 338,583 (−91%) |
| `tsc` heap (non-incremental) | 3.90 GB | 2.76 GB (−29%) |
| `tsc` time | 25.2 s | 20.0 s |
| `next build`, largest process peak memory | 4.79 GB | **3.18 GB (−34%)** |
| `next build` wall time | 84 s | 63 s |

## Root cause
`googleapis` accounts for **89.7% of all type-definition lines** (3,378,175 lines in 917 files). The application uses one Google API (Sheets), through one file (`src/lib/googleSheets/client.ts`), but importing the package root loads the definitions of every Google API into every type-check. On Vercel's build machine (2 cores, 8 GB) the type-check alone held ~3.9 GB on top of the rest of the build, leaving little headroom: the failures are resource exhaustion near the ceiling (an OOM kill, or a stall while memory thrashes), not a defect in the application or in TypeScript. Application growth (about 1,900 source files, 505 of them tests) raised the baseline; the dependency made it fragile. Vercel's compile step is also ~7× slower than local (2.4 min vs ~20 s), which lengthens the window in which memory is held.

## Corrective measure (implemented, tested, in this branch)
`src/lib/googleSheets/client.ts` now imports `googleapis/build/src/apis/sheets` (the Sheets module that `google.sheets` and `google.auth` resolve to) instead of the package root. Same package, same pinned version, no dependency or lockfile change, no TypeScript check disabled or narrowed (every source and test file is still checked, in CI and in the build), no lint or security rule changed. A regression test fails if anything imports the package root again; a second test proves the Sheets client still constructs.

## Options considered
| Option | Effect | Cost / risk | Recommendation |
|---|---|---|---|
| A. Narrow the googleapis import (done) | −1.1 GB tsc heap, −1.6 GB largest build process, −25% build time | none; one file | **Do** |
| B. Exclude test files from the build's own type-check (separate tsconfig for `next build`; CI keeps checking everything) | a further ~0.3 GB / ~5 s | a second tsconfig to maintain; build no longer type-checks tests (CI still does) | Optional, only if A is not enough |
| C. Upgrade the Vercel build machine | more headroom | **recurring cost; needs Founder approval; not done** | Not needed if A holds |
| D. Replace `googleapis` by `@googleapis/sheets` | similar to A | new dependency + lockfile change | Unnecessary |
| E. Disable the TypeScript step in the build | hides the problem | removes a safeguard | **Rejected** |
Not the cause: dependency size on disk (1.4 GB), the Sanity/Supabase fetches during static generation (they fail fast and are not memory-heavy), CI (GitHub's runner has more memory and was never affected).

## Expected reliability and how to verify
Largest build process ~3.2 GB leaves ~4.8 GB of an 8 GB machine for everything else (was ~3.2 GB). Verify after release: the next several Production deployments each build in about 3–5 minutes with no retry; the Vercel build log shows no "Out of Memory" report. If a failure recurs, apply B first, then raise C with the Founder.
