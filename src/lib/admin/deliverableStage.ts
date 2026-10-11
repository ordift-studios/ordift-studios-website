// When may publishing a deliverable advance an enquiry's CRM stage to "delivered"?
//
// DEFECT this fixes (found 2026-10-11): the first published deliverable of ANY category moved a
// booked / in-progress enquiry to "delivered". For a Creative Crew Support job that is wrong — a
// thank-you image, call sheet or invoice is not the delivery of the project, and the Crew Support
// request's own status (not a file upload) governs its lifecycle. It is wrong for any other enquiry
// too when the file is not a final output.
//
// Rule: advance ONLY for a final-output category on an enquiry that is not a Crew Support job.
// A positive allow-list of category keys (keys are data in deliverable_categories), so a new category
// such as a preview, sneak peek or thank-you image can never advance the project by accident.
export const DELIVERY_ADVANCING_CATEGORY_KEYS: readonly string[] = [
  "edited-photos",
  "final-videos",
  "gallery-links",
  // reserved for the planned release categories (data only, no migration): final outputs
  "final-gallery",
  "final-designs",
];

export function shouldAdvanceToDelivered(params: { entityType: string; categoryKey: string | null; isCrewSupportEnquiry: boolean }): boolean {
  if (params.entityType !== "enquiry") return false; // workshop registrations have no CRM stage
  if (params.isCrewSupportEnquiry) return false; // the Crew Support request status governs these
  if (!params.categoryKey) return false; // unknown category: never guess
  return DELIVERY_ADVANCING_CATEGORY_KEYS.includes(params.categoryKey);
}
