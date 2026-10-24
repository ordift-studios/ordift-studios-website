// The wording a client sees when asked for marketing permission. It is a DRAFT for the Founder (and, where wanted, counsel) to approve: no permission may be
// requested from a client with it until PERMISSION_TEXT_APPROVED is set by that approval. The version string is stored with every answer, so a later
// change in wording never alters what an earlier answer meant. Refusing never affects delivery of photographs or any other service already owed.
export const PERMISSION_TEXT_VERSION = "mkt-permission-draft-1";
export const PERMISSION_TEXT_APPROVED = false;

export const PERMISSION_TEXT = {
  title: "May Ordift Studios use photographs from your project to promote its work?",
  intro: "This is optional. Whatever you choose, your photographs and every other service you are owed are delivered exactly as agreed.",
  scope: "If you agree, Ordift Studios may use the photographs shown below only for the uses you tick, and only within any limits you set. Nothing is ticked for you.",
  restrictionsLabel: "Anything we must avoid (for example: no photographs of children, no names, no faces of guests)",
  withdrawal: "You can withdraw this permission at any time from this page. Withdrawing stops any future use; it cannot recall material already seen or printed, but we will review anything currently in use.",
  accept: "I agree to the uses I have ticked for the photographs shown",
  decline: "No, please do not use these photographs for promotion",
} as const;
