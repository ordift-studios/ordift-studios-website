# PROPOSED — Ghana registry data step (NOT EXECUTED; needs the Founder's separate written authorisation, and only AFTER migration 0173 is live)

Contains no registration number, TIN, name or address. The values come from the secure vault / the existing restricted sensitive-details record at execution time.

## Evidence already checked (read-only, 2026-10-26)
- Certificate of Registration (Registration of Business Names Act, 1962) dated 7 May 2018, Form A pages 1-3 (sole proprietorship), and the existing restricted sensitive-details record for the Ghana entity all show the SAME business registration number and the SAME TIN (compared as booleans, never printed). Both match the formats BN + 9 digits and P + 10 digits.
- Pages 2 and 3 of Form A carry the same footer ("Registration – Sole Proprietorship", page x of 3), the same watermark, the same principal address as page 1, and page 3 names the owner (the same person as the Ghana signatory recorded as Chief Executive Officer, linked to ONE existing profile).

## Steps (each through the audited application functions, one at a time, each verified read-only before the next)
1. Attach Form A pages 2 and 3 to the existing Form A record (relation `continuation_page_of`, page 2 of 3 and 3 of 3). Page 1 and the certificate are not touched; no second registration is created.
2. Record the Ghana CR-equivalent registration (kind `commercial_registration`): number as printed, issued 2018-05-07, no expiry, issuing authority as printed, source = the certificate record, Founder cross-check ticked (stored as a cross-check, not as government confirmation).
3. Record the TIN (kind `tax_registration`): optional for issuing, never printed on client documents. Same source.
4. Record the legal capacity "Sole proprietor" on the EXISTING signatory row (the management title "Chief Executive Officer" is unchanged; same person, same profile link; settable once).
5. Record the Founder's renewal statement as `founder_confirmed` / basis `founder_statement`, covering 2018-05-07 to the statement date, in the Founder's own words, with NO reference number, NO verifier and NO document. Optional later: an official verification (Registrar's record, or a renewal certificate/receipt) as a NEW record.

## Not part of this step
Qatar: no activity record, no permit, no capacity change; the entity stays blocked until the commercial permit is issued, recorded and verified. No entity is selected and no quotation is issued.

## Preconditions and checks
- Production ledger at 0173; the entity page loads; Ghana shows "not eligible" BEFORE the step and the expected state AFTER (certificate met, signatory met, renewal advisory "Founder-confirmed; official verification pending", TIN tracked).
- Row counts: exactly +1 CR record, +1 TIN record, +1 renewal row, +2 document rows, +1 capacity value; nothing else changes (fingerprint compare).
