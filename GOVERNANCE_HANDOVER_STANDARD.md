# Technical-to-Governance Handover Standard

**Established:** 2026-07-30, addressing TD-015 (`TECHNICAL_DEBT_REGISTER.md`) at your explicit direction, as a permanent governance concern rather than a one-off fix.

**Purpose:** since 2026-07-30, legal drafting, contractual wording, and governance/commercial documentation belong to Claude Chat; this environment (Claude Code) remains the Technical Authority. That split is deliberate and correct, but it introduces exactly one coordination cost: a technical change here can silently make a governance document inaccurate, and a governance decision there can silently assume technical behavior that isn't real. This standard exists to make that handover controlled and visible instead of relying on memory across sessions/tools.

**This does not create duplicate documentation.** There is exactly one authoritative technical source, exactly one authoritative governance source, and one lightweight, append-only handover record between them.

---

## 1. The two authoritative sources

- **Technical Authority (this repository):** `TECHNICAL_DEBT_REGISTER.md`, `TECHNICAL_DECISION_RECORDS.md`, `ARCHITECTURE.md`, `PRODUCT_ROADMAP.md`, and the schema/migrations themselves are the ground truth for what the platform actually does. Nothing about personal data, cookies, retention, or any topic below should be verified anywhere else — if it's not true in the code/schema, it's not true.
- **Governance Authority (Claude Chat):** legal drafting, policy wording, and compliance judgment happen there — currently represented in this repository as `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md` and `LEGAL_REVIEW_REPORT.md` (drafted before the 2026-07-30 workflow split, now maintained going forward via Claude Chat). This environment does not edit governance wording; it verifies technical claims within it when asked, and flags drift per §2 below.

## 2. What triggers a handover flag

Any technical change in this repository that touches one of the following categories gets a flag (§3) the moment it ships, not retroactively:

- Personal-data collection (new field, new form, new data source)
- Cookies (any new cookie, tracking pixel, or client-side storage of identifying data)
- Authentication (login/signup/session behavior, password handling, MFA)
- Data storage (new table holding personal/sensitive data, new third-party data store)
- Retention and deletion (how long data is kept, how/whether it's deleted)
- Email or notification behavior (what's sent, to whom, opt-in/opt-out mechanics)
- Third-party processors (any new vendor that touches user data — see `TECHNOLOGY_COST_REGISTER.md` for the existing list)
- File handling (uploads, storage, access control — see TD-007/TDR-008)
- AI functionality (any AI-assisted feature that processes user data or generates user-facing content — currently none exist; Ordift Pulse's future summarization step, per `PRODUCT_ROADMAP.md` Version 4.0, will be the first)
- Payments (currently none exist — the retired Commerce/payment-gateway history in `MILESTONES.md`)
- Client rights (anything affecting a client's ability to access, correct, export, or delete their own data)
- Staff or talent workflows (new HR/talent data fields — relevant from Version 1.1/2.0 onward)
- International data transfers (any change to where data is hosted/processed geographically)

## 3. The handover record

`GOVERNANCE_HANDOVER_LOG.md` — one dated entry per flagged change, each stating: what changed, which trigger category it falls under, why it matters for governance, and its status (Flagged / Reviewed / Resolved). This is not a duplicate of the technical debt register or the ADR/TDR log — it's purely the *signal* that something needs governance attention, pointing back to the real technical record (a TD-xxx, TDR-xxx, or migration number) rather than re-describing it.

**Discipline:** a flag is added the same session the triggering change ships, following the same "nothing should exist only in memory" principle already standing for `TECHNICAL_DEBT_REGISTER.md`. A flag is marked Resolved only once governance (Claude Chat, or you directly) has actually addressed it — not when the technical work is done.

## 4. What this standard does not do

- It does not give this environment authority to write or approve legal/policy language — that stays with Claude Chat per your 2026-07-30 direction.
- It does not create a second technical documentation trail — every flag entry is a pointer, not a copy.
- It does not require a review for every commit — only changes matching §2's categories.

---

*Cross-references: `TECHNICAL_DEBT_REGISTER.md` (TD-015), `GOVERNANCE_HANDOVER_LOG.md` (the record this standard defines), `LEGAL_REVIEW_REPORT.md`, `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md`, `DOCUMENTATION_INDEX.md`.*
