// Session Schedule safeguarding fields (whether the programme involves participants under 18, and the venue's safeguarding and emergency arrangements) depend on PROPOSED migration 0181, which is NOT applied.
// While this is false NO code reads or writes those columns, the schedule form does not show them, and approval is unchanged. Switch on only after 0181 is authorised, applied and verified in Production.
export const SCHEDULE_SAFEGUARDING_ENABLED = false;
