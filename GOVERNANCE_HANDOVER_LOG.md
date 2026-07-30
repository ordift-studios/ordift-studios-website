# Governance Handover Log

**Established:** 2026-07-30, per `GOVERNANCE_HANDOVER_STANDARD.md`. Every entry below is a flag pointing at a real technical record — not a copy of it. Add a new entry the same session a triggering change ships.

**Format:**
```
### [Date] Short title
- **Trigger category:** (from GOVERNANCE_HANDOVER_STANDARD.md §2)
- **What changed (technical):** pointer to the real record — TD-xxx, TDR-xxx, or migration number
- **Why it matters for governance:** the specific governance question this raises
- **Status:** Flagged / Reviewed / Resolved
```

---

### 2026-07-30 (backfilled) — Workshop status field mismatch
- **Trigger category:** Client rights / data accuracy in published policy
- **What changed (technical):** the real `workshop` schema (`src/lib/content/sanity/schemas/workshop.ts`) has five status values (`coming-soon`, `open`, `full`, `closed`, `completed`); the drafted Legal Suite's Part 11.7 describes only three, omitting the waitlist-triggering `full` state.
- **Why it matters for governance:** a published policy describing platform behavior inaccurately is itself a governance/accuracy risk, independent of which values are "correct" — the policy text needs to match reality before publication.
- **Status:** Flagged — already surfaced directly in `LEGAL_REVIEW_REPORT.md` Part C (2026-07-30 QC pass) per your explicit "flag it clearly instead of silently changing it" instruction. Backfilled into this log for continuity now that the formal handover standard exists. Awaiting resolution via Claude Chat's governance track.

---

*No other flags open as of 2026-07-30. Cross-references: `GOVERNANCE_HANDOVER_STANDARD.md`, `TECHNICAL_DEBT_REGISTER.md` (TD-015), `LEGAL_REVIEW_REPORT.md`.*
