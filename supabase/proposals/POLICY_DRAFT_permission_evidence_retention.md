# DRAFT (for management approval): retention and deletion of photograph permission evidence

Status: draft. Nothing here is active. No automated deletion exists or will be switched on until this schedule is approved. Review owner (management direction): the Founder / Super Admin, Myredlive Anim-Tetey, with a documented review at least every 12 months.

## 1. What the law says (verified against official text) and what it does not
Sources read: the Ghana Data Protection Act, 2012 (Act 843) as published by the Data Protection Commission; the English translation of Qatar Law No. 13 of 2016 published by the National Cyber Security Agency (NCSA), which states it is not the official text (the Official Gazette no. 15 of 2016 on almeezan.qa is). No counsel was contacted and neither jurisdiction's regulator guidance beyond these texts was relied on.

MANDATORY (stated in the texts):
| Rule | Ghana, Act 843 | Qatar, Law 13/2016 |
|---|---|---|
| Keep personal data no longer than necessary for the purpose | s.24(1): not longer than necessary unless (a) law requires or authorises it, (b) reasonably necessary for a lawful purpose related to a function or activity, (c) a contract requires it, or (d) the data subject consents | Art. 10: must not keep personal data for longer than the period necessary for the purposes |
| Destroy, delete or de-identify when the retention period ends | s.24(5); s.24(6): so it cannot be reconstructed in intelligible form | Art. 5(3): a person may ask for omission or erasure when the purpose has ceased or all justification for keeping it has ceased |
| Individual's request to delete or correct | s.33: correct or delete data that is inaccurate, irrelevant, excessive, out of date, misleading or unlawfully obtained, and destroy a record the controller is no longer authorised to retain | Art. 5, Art. 6, Art. 11(4): systems to receive and handle access, correction and erasure requests |
| Children | s.37(1)(a): personal data of a child under parental control is not to be processed unless the Act provides (e.g. necessity or consent, s.37(2)) | Art. 16: personal data relating to children is "of a special nature" and may be processed only after obtaining the permission of the Competent Department under the Minister's decision; Art. 17 (guardian consent and deletion on request) applies to websites addressing children |
| Registration | ss.27, 47, 50, 53, 55, 56: register as a data controller; renew every two years; notify changes in registered particulars within 14 days; processing without registration is prohibited and an offence | No registration regime found in the text; permission needed for special-nature data (above) |
| Fixed retention period for this kind of record | NONE stated in the sections read | NONE stated in the text read |

NOT RESEARCHED (so no conclusion is drawn): limitation periods for contract or defamation/privacy claims in Ghana or Qatar, tax or accounting record-keeping rules, whether the Qatar Competent Department has issued a procedure for children's photographs, and any sector code of conduct. These are the "legal obligation" and "dispute" sources the policy refers to; they matter most for the length of the dispute window below.

## 2. Proposed retention schedule (RECOMMENDED INTERNAL PRACTICE unless marked mandatory)
| Record | While | Then |
|---|---|---|
| Permission grant, verification, withdrawal, replacement (names, relationship, authority and evidence references) | the permission is in force, or the photograph is in use for a covered use | keep for a dispute window after the end of the permission AND the end of the last covered use. PROPOSED: 12 months (one annual review cycle). Management may lengthen it only for a documented legal or dispute reason (e.g. a limitation period confirmed by advice). |
| After the dispute window | n/a | erase personal details with the controlled erasure function at the next annual review, unless a hold is in place. The decision structure (kind of grantor, dates, uses, outcome) stays. Mandatory basis: Ghana s.24(5)-(6); Qatar Art. 10 and 5(3). |
| Hold (dispute, complaint, audit, legal obligation) | until released with a recorded reason | the dispute window restarts from release. |
| Children's records (guardian grants) | same triggers | no longer than the schedule above; reviewed first in each annual review. |
| Supporting evidence files (only if genuinely necessary; none held today) | same clock as the grant they support | deleted with the details; stored only in approved restricted storage with minimum access and audit. |
| Declarations and subject labels (no names) | as long as the photograph record exists | kept (not personal data). |
| Erasure log and hold log (who, when, why, confirmation) | permanently | kept: they contain no personal data and are the audit trail of the erasure. |
| Identity documents | never collected by default | n/a |

## 3. Annual review (owner: the Founder)
Once every 12 months, and on any trigger (withdrawal, expiry, a request from an individual, a complaint): list permissions that ended more than the dispute window ago; confirm no hold, dispute, audit or legal obligation applies; confirm the photograph is not still in use; then erase with the controlled function, recording the reason and the confirmation that erasure is permitted. Record the review (date, reviewer, count erased, count kept and why).

## 4. Gaps this review found (need a decision)
1. The earlier client-permission tables (migration 0170: marketing_permission_records) also hold names of the people who gave permission (the client or a representative) and are append-only with NO erasure path. Ghana s.24(5) and Qatar Art. 10 apply to them equally. A small follow-up migration extending the controlled erasure and hold rules to those records should be authorised before client requests are activated.
2. Children's photographs and Qatar Art. 16: if Ordift processes photographs of children in Qatar, the text says the Competent Department's permission is required first. Whether a procedure applies, and whether Ordift needs to apply, has not been established here. Until it is, a prudent internal rule is to exclude children from any Qatar-originating portfolio use.
3. Ghana registration: see the separate findings on registration (the public register shows no entry for Ordift).
4. Automated deletion: none is built or proposed. Erasure is always a manager's recorded decision.

## 5. UPDATE after management review (1 Nov 2026)
Limitation periods (see COMPLIANCE_FINDINGS_*.md): Ghana 2-12 years by claim type (contract 6 years per court sources), Qatar 3 years from knowledge / 15 years from the act for unlawful-act claims (Art. 219). The provisional 12-month window is therefore NOT a confirmed retention period and is shorter than the periods that could apply to a claim. Options for decision: (A) keep 12 months and accept that an old claim could not be evidenced; (B) 3 years after the end of the permission and last use (covers Qatar tort limitation from knowledge and most Ghana tort periods); (C) 6 years (covers Ghana contract claims) but only for the minimum fields (grantor name, relationship, date, uses, evidence reference), with any supporting file deleted after 12 months and children's records no longer than B. Recommendation: B, with C only where a concrete dispute exists (use a hold instead, which is already built).
Erasure and hold logs: they hold who (a staff user), when, a reason of 10-200 characters and the confirmation flag. They can contain personal data in two ways: the reason text (now capped at 200 characters in the application with a "no names" instruction; the database check for the older-records migration also caps it) and the staff identifier. Data minimisation: keep them for the same dispute window as the records they relate to, then review rather than keep permanently; because the tables are append-only, deleting log rows would need its own controlled path, so the practical control is to keep their content free of personal details of the people in the photographs. Decision requested: confirm "same window, then review" instead of "permanently".
