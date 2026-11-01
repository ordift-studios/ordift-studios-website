// Session Schedule safeguarding fields (whether the programme involves participants under 18, and the venue's safeguarding and emergency arrangements) depend on migration 0181, applied to Production on 1 Nov 2026 (R13 backup verified, ledger 0181/173, post-checks passed).
// While this is false NO code reads or writes those columns and the schedule form does not show them. ON since the migration was confirmed.
export const SCHEDULE_SAFEGUARDING_ENABLED = true;
