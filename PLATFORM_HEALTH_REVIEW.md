# Platform Health Review — 2026-07-30

**Established:** 2026-07-30, at your explicit standing instruction — a Platform Health Review is performed before every major engineering increment from this point forward, not only when something is visibly wrong. This is the first one.

**Scope:** the full platform as it stands after Version 1.0.5 Workstreams E, F, and A (increment 1) shipped — the technical debt register, the TDR system, and the unit + hybrid integration-testing layer. Every finding below is either a cross-reference to something already tracked (`TECHNICAL_DEBT_REGISTER.md`, `TECHNICAL_DECISION_RECORDS.md`) or a new item, verified directly rather than assumed, added to the register as part of this review (TD-012 through TD-015).

**How to read this:** 17 dimensions, each a short, honest read — not padded to look thorough. Several dimensions currently have "no new finding" as their honest answer; that's reported as such, not skipped, so the review's coverage is visible.

---

## 1. Technical Debt

15 tracked items (`TECHNICAL_DEBT_REGISTER.md`, TD-001–TD-015). Three are High severity and already scheduled within Version 1.0.5 (TD-001 no tests — in progress; TD-002 no CI; TD-003 no error monitoring). The rest are Medium/Low, either scheduled or deliberately tracked-not-urgent. No new High-severity item found this review beyond what's already scheduled.

## 2. Architectural Debt

TD-010 (Sanity `legalPage` body as plain text, not portable text) is the one live architectural debt item — blocks rich formatting in legal content, worth revisiting only once the approved Legal Suite is ready to actually publish. No other architectural debt found; the four-independent-axis IAM model (TDR-004), RLS-as-boundary (TDR-002), and content-repository abstraction (TDR-001) have all held up under real use without strain.

## 3. Security Gaps

TD-004 (no CSP header) is the one open gap, already scoped for Workstream I. TD-014 (no recurring secret-rotation cadence) is new this review — low severity at current scale, named so it isn't an unstated assumption. Workstream I (security re-review) hasn't run yet — until it does, "no other gaps found" should be read as "nothing found without yet having deliberately looked," not as a clean bill of health.

## 4. Operational Risks

Single-operator context (you) means no on-call rotation or escalation path exists — appropriate at current scale, but worth naming as the honest current state rather than assuming a policy exists. TD-005 (Sheets/email dead-letter tables unalerted) is the concrete operational risk with a scheduled fix (folds into Workstream C).

## 5. Observability Gaps

TD-003 (no error monitoring) is the biggest one, already scheduled as Workstream C. **New this review: TD-013, no uptime/synthetic monitoring** — Sentry will catch application errors once it ships, but nothing currently detects "the site itself is unreachable" (a Vercel incident, DNS issue, expired cert) independent of the app's own error reporting. This is cheap to add alongside Workstream C and should be folded into it rather than treated as a separate initiative.

## 6. Testing Gaps

Workstream A increment 1 (unit layer + RLS integration proof) shipped and verified. Still open: Sheets-sync integration tests, email-delivery-assertion tests, booking/portal/admin workflow tests — the architecture for all of these already exists (`INTEGRATION_TESTING_STRATEGY.md`), so this is extension work, not new design. TD-011 (component/UI testing blocked by a dependency conflict) remains open, low severity.

## 7. Deployment Risks

Deploys are still manual (`vercel --prod --yes`, run by hand after local verification). No CI gate exists yet to catch a bad push before it ships (TD-002, scheduled as Workstream B). This is the most concrete "something could go wrong before the safety net exists" risk on this list — worth weighing in the priority order below.

## 8. Dependency Risks

Fully covered by `DEPENDENCY_WATCHLIST.md`: one active conflict (DW-001, blocks component testing, workaround in place), two cosmetic deprecation notices, 31 npm audit findings judged non-blocking with stated reasoning (TD-006), and a version-currency table flagging which major-version gaps (ESLint, TypeScript, `@types/node`) need deliberate review rather than routine bumping. No new dependency risk found this review.

## 9. Vendor Lock-In Concerns

**New this review: TD-012.** Most third-party dependencies (Resend, Upstash, Turnstile) are shallow and swappable. Supabase is not — Auth, RLS authorization, and Realtime are deeply architectural (TDR-002), so migrating off Supabase would mean rebuilding authorization from scratch, not swapping a client. This is the direct, accepted consequence of a deliberate decision, not an oversight — logged as a tracked concentration risk, not a problem requiring action.

## 10. Backup and Disaster Recovery Gaps

TD-008 (Supabase Free plan, no automated backups, only manual `pg_dump`) is the live gap, with Workstream H (DR review) scoped to stress-test it against a genuine "disaster happened today" scenario and perform the first real restore rehearsal (only a `pg_restore --list` table-presence check has been done so far, not a full restore drill). Workstream H hasn't run yet.

## 11. Performance Bottlenecks

None observed — the site has no real production traffic yet (still behind `LAUNCH_HOLDING_PAGE`). Nothing to report honestly beyond "not yet measurable."

## 12. Scalability Bottlenecks

Same as above — Workstream J (scalability assessment, documentation only, no premature optimization) hasn't run yet. No current bottleneck exists to report at pre-launch scale.

## 13. Maintainability Issues

TD-010 (plain-text legal body field) is the one live item. The two deliberate "build-ahead" decisions (media component library, TDR-006; Ordift Pulse, TDR-007) were each justified by already-demonstrated repetition or explicit direction, not speculative generality — reviewed here and still judged sound, not a maintainability risk.

## 14. Documentation Drift

**New this review: TD-015.** The 2026-07-30 Claude Code / Claude Chat split (technical vs. legal-governance-commercial documentation) introduces a coordination cost: nothing automated checks that a legal-suite edit touching a factual/technical claim gets reconciled with actual platform behavior, or vice versa. The one known real instance (the Workshop-status-field discrepancy) was already caught by manual QC discipline, which is some evidence the practice works at current scale — but it's a manual discipline, not a structural guarantee, and is named as such rather than assumed reliable.

## 15. Monitoring Blind Spots

Same root cause as §5 (Observability Gaps) and §13's TD-013 — no error monitoring, no uptime monitoring, no dead-letter-table alerting. All three converge on the same fix (Workstream C, scoped slightly wider than originally written to include TD-013).

## 16. Compliance Implications

The Legal Suite remains unapproved/unpublished, now owned by Claude Chat per the 2026-07-30 workflow split. `LEGAL_REVIEW_REPORT.md`'s two highest-priority open risks (model/property release handling, international data transfers) remain open there, outside this environment's remit per your instruction not to spend engineering time on legal drafting. No new compliance finding from the technical side this review.

## 17. Future Roadmap Blockers

Two named, already-tracked blockers: the Version 2.0 secure-document-storage decision (TDR-008, hard release-criterion dependency) and the Supabase Pro-plan billing decision (deferred, `DOCUMENTATION_INDEX.md` §4). Both are business/owner decisions, not engineering work — flagged here so they stay visible rather than forgotten, not because either needs code written against it now.

---

## Recommended Engineering Priority Order

This review does not propose a new sequence from scratch — it validates and lightly refines the execution order `PRODUCT_ROADMAP.md`'s Version 1.0.5 already committed to, folding in this review's two actionable new findings (TD-013 into Workstream C's scope, TD-014 into Workstream I's scope and `MAINTENANCE_SCHEDULE.md`). Where a proposed increment isn't the highest-leverage next investment, that's said explicitly below rather than defaulted into.

| Order | Item | Why it matters | Risk of postponing | Dependencies | Effort | Long-term maintenance implication | Commercial/operational impact |
|---|---|---|---|---|---|---|---|
| 1 | **Finish Workstream A** — Sheets-sync + email-delivery-assertion integration tests, booking/portal/admin workflow coverage | The architecture is already proven (real RLS test passing against staging); this is extension, not new design — cheapest remaining increment relative to value | Grows slowly, not urgently — each week without it is one more week of manual-only verification on these flows | None new — reuses `INTEGRATION_TESTING_STRATEGY.md`'s harness | Low-Medium | Every future change to these flows gets a regression check instead of manual re-verification | None negative; reduces risk of a booking/portal regression reaching real clients post-launch |
| 2 | **Workstream B — CI pipeline**, gated on tests existing | Currently every deploy is a manual, unenforced judgment call (§7 above) — the single highest-leverage remaining gap now that tests exist to run | Grows with every deploy between now and when it ships — this is the most concrete "something could slip through" risk on the whole list | Workstream A (needs tests to gate on) | Low | Converts "we remembered to check" into "it's structurally impossible to skip" | Directly protects commercial reliability — a bad deploy reaching real clients is the most visible failure mode this fixes |
| 3 | **Workstream C — Observability, scope widened to include TD-013** | No production error visibility (TD-003) and no uptime visibility (TD-013) are both live gaps that become real risks the moment `LAUNCH_HOLDING_PAGE` comes down — this should land *before* that, not after | High if postponed past launch — a production incident would be discovered by a client, not the platform, exactly the scenario TD-003/TD-013 describe | None | Low-Medium | Ongoing: alert-fatigue discipline needs conservative thresholds, per the original Sentry evaluation | Directly protects commercial reliability post-launch; near-zero cost (free tiers) |
| 4 | **Workstream I — Security re-review, scope includes TD-014** | Security re-reviews are the one category where "verified once" doesn't stay true as the system grows — due for a skeptical second look, not just trusting the original passes | Low near-term (no new attack surface added recently), grows over time if never repeated | None | Medium (review-heavy, code changes only where a real gap is found) | Establishes the re-review as a recurring practice, not a one-time event | Protects against the highest-severity failure mode (a real breach), even though likelihood is currently low |
| 5 | **Workstream H — Disaster recovery review** (genuine restore rehearsal, not just a table-presence check) | TD-008's backup gap is real but currently untested end-to-end — "we could recover" and "we have recovered, once, in a drill" are different claims | Medium — low probability, high consequence if a real disaster hit before this is verified | None | Low-Medium | Establishes the restore-rehearsal cadence `MAINTENANCE_SCHEDULE.md` already names as a future practice | Business continuity insurance — cheap now, very expensive to discover a gap in during a real incident |
| 6 | **Workstream J — Scalability assessment** (documentation only) | Pure documentation, no implementation risk, cheap insurance against being surprised by a limit later | Low — nothing is close to any real limit at pre-launch scale | None | Low | One-time documentation effort, revisited only when a named trigger point is approached | None near-term; prevents a reactive scramble later |
| 7 | **Workstream D — Engineering standards docs**, completing `ENGINEERING_GUIDE.md` | Most valuable once B and C exist to actually describe (CI process, monitoring architecture) — sequencing this after them, not before, avoids documenting things that don't exist yet | Low — `ENGINEERING_GUIDE.md` already exists with its most load-bearing section (Environment Configuration) written | B, C (to document real CI/monitoring, not planned) | Medium | This is the document a future engineer reads first — worth getting right once, not rushed | Long-term maintainability/onboarding, not near-term commercial impact |
| 8 | **Workstream G — Platform Health status doc** (lightweight `SYSTEM_HEALTH.md`, not a live dashboard app) | Naturally last — it's substantially a synthesis view over B/C/E's outputs; building it earlier would mean documenting things that don't exist yet | Low | B, C, E (all exist by this point) | Low | Goes stale if not maintained — mitigate by treating it as part of every future milestone's definition-of-done | Low direct impact; internal visibility tool |

**What this review deliberately does *not* recommend right now:** starting Version 1.1 (Internal Organization/Grade module — already paused per the LC1/Version-1.0.5 sequencing), or building Workstream G as a live dashboard application (still the right call per the original scope concern — a dashboard app is itself a feature, which cuts against this whole milestone's purpose). Both stay explicitly out of scope until Version 1.0.5 completes.

---

## Approval Gate

Per your standing instruction, no implementation begins from this review until you approve the sequence above. This review confirms the existing Version 1.0.5 order (A→B→C→I→H→J→D→G) with two scope adjustments (C absorbs TD-013, I absorbs TD-014) rather than proposing a different one — flagged clearly in case you'd rather reorder or push back on that conclusion before I continue.

---

*Cross-references: `TECHNICAL_DEBT_REGISTER.md` (TD-012–TD-015 added this review), `TECHNICAL_DECISION_RECORDS.md`, `PRODUCT_ROADMAP.md` (Version 1.0.5), `DEPENDENCY_WATCHLIST.md`, `INTEGRATION_TESTING_STRATEGY.md`, `ENGINEERING_GUIDE.md`, `MAINTENANCE_SCHEDULE.md`, `DOCUMENTATION_INDEX.md`.*
