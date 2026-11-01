// The wording a client sees when asked for marketing permission. It is a DRAFT for the Founder (and, where wanted, counsel) to approve: no permission may be
// requested from a client with it until PERMISSION_TEXT_APPROVED is set by that approval. The version string is stored with every answer, so a later
// change in wording never alters what an earlier answer meant. Refusing never affects delivery of photographs or any other service already owed.
export const PERMISSION_TEXT_VERSION = "mkt-permission-draft-2";
export const PERMISSION_TEXT_APPROVED = false;

// DRAFT 2 (2 Nov 2026) for management approval - NOT approved, NOT live: PERMISSION_TEXT_APPROVED stays false, so no request can be sent and the client page stays closed. Commissioning or paying for
// photography is never treated as permission: this request is the only basis for using an identifiable image in the portfolio and promotion. The new keys (selection, uses, limitsOnReuse, rightsOfOthers)
// are not rendered by any page yet; they are wired when the wording is approved.
export const PERMISSION_TEXT = {
  title: "May Ordift Studios use photographs from your project to promote its work?",
  intro: "This request is optional. Commissioning or paying for photography does not, by itself, give Ordift Studios permission to publish identifiable images of you, your event or your guests. Whatever you choose, your photographs and every other service you are owed are delivered exactly as agreed.",
  selection: "This request covers only the photographs shown with it, identified by a preview and an image number. It does not cover any other photograph from your project.",
  scope: "If you agree, Ordift Studios may use the photographs shown only for the uses you tick, and only within any limits you set. Nothing is ticked for you. You may agree to some uses and decline others.",
  uses: [
    "Ordift Studios' portfolio, including printed and PDF portfolios shown or sent to prospective clients",
    "The Ordift Studios website and journal",
    "Ordift Studios' social-media accounts",
    "Printed material such as rate cards, flyers and brochures",
    "Paid advertising",
  ],
  restrictionsLabel: "Anything we must avoid (for example: no photographs of children, no names, no faces of guests)",
  limitsOnReuse: "Ordift Studios will use the photographs only in the form and for the purposes you tick. We will not sell or license them to third parties, and we will ask you again before any new kind of use.",
  rightsOfOthers: "Your answer covers you only. If the photographs show other people (such as guests, family, employees or models) or protected property, please agree only if you are entitled to do so for them or they have given the permission needed; otherwise tell us which images to exclude. Ordift Studios will not use an image where we know that someone shown in it has not agreed.",
  withdrawal: "You can withdraw this permission at any time from this page or by writing to us. Withdrawing stops any future use. It cannot recall material already published, printed or sent (for example a printed portfolio or a post already seen), but we will review anything currently in use and remove it from our own channels and files where we reasonably can.",
  accept: "I agree to the uses I have ticked for the photographs shown",
  decline: "No, please do not use these photographs for promotion",
} as const;
