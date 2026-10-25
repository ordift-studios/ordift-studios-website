// A quotation created for a TEST enquiry is itself a test record. The flag only ever moves toward "test": a test enquiry can never produce a quotation that looks real, and an
// explicit request for a test quotation is always honoured. (Crew Support copies the flag the same way from its request.)
export const inheritedTestFlag = (explicit: boolean | undefined, enquiryIsTest: boolean | null | undefined): boolean => Boolean(explicit) || Boolean(enquiryIsTest);
