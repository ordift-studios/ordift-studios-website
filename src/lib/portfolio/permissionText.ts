// The wording a client sees when asked for marketing permission. It is a DRAFT for the Founder (and, where wanted, counsel) to approve: no permission may be
// requested from a client with it until PERMISSION_TEXT_APPROVED is set by that approval. The version string is stored with every answer, so a later
// change in wording never alters what an earlier answer meant. Refusing never affects delivery of photographs or any other service already owed.
export const PERMISSION_TEXT_VERSION = "mkt-permission-draft-3";
export const PERMISSION_TEXT_APPROVED = false;

// DRAFT 3 (2 Nov 2026) for management approval - NOT approved, NOT live: PERMISSION_TEXT_APPROVED stays false, so no request can be sent and the client page stays closed. Commissioning or paying for
// photography is never treated as permission: this request is the only basis for using an identifiable image in the portfolio and promotion. Each use below is one of the recorded destinations
// (destinations.ts) and is ticked separately; nothing is ticked for the client. A change to ANY wording below must change PERMISSION_TEXT_VERSION (a test pins the two together).
export const PERMISSION_TEXT = {
  title: "May Ordift Studios use photographs from your project to promote its work?",
  intro: "This request is optional. Commissioning or paying for photography does not, by itself, give Ordift Studios permission to publish identifiable images of you, your event or your guests. Whatever you choose, including saying no, your photographs and every other service you are owed are delivered exactly as agreed.",
  selection: "This request covers only the photographs shown with it, each identified by a preview and an image number. It does not cover any other photograph from your project.",
  scope: "If you agree, Ordift Studios may use the photographs shown only for the uses you tick, and only within any limits you set. Nothing is ticked for you. You may agree to some uses and decline others.",
  uses: {
    portfolio: "Ordift Studios' portfolio, including printed and PDF portfolios",
    client_samples: "Samples shown or sent to prospective clients",
    website: "The Ordift Studios website",
    journal: "The Ordift Studios journal",
    social_media: "Ordift Studios' social-media accounts",
    brochure: "Brochures",
    print_collateral: "Rate cards, flyers and other printed material",
    paid_advertising: "Paid advertising",
  },
  restrictionsLabel: "Anything we must avoid (for example: no photographs of children, no names, no faces of guests)",
  limitsOnReuse: "Ordift Studios will use the photographs only in the form and for the purposes you tick. We will not sell or license them, and we will not allow unrelated third parties to reuse them. We will ask you again before any new kind of use.",
  rightsOfOthers: "Your answer covers you only. It is not treated as permission from anyone else shown in the photographs, and it does not extend to protected property. Please agree only if you are entitled to do so for the people and property shown; otherwise tell us which images to exclude.",
  minors: "We do not use an image showing a child, or any other identifiable person, unless the permission needed for that person is in place and any safeguards that apply are met; for a child that includes the permission of a parent or guardian. Where it is not, the image stays unused whatever you have ticked.",
  record: "We keep a record of the wording you saw, the photographs and uses you chose, any limits you set, and when you answered.",
  withdrawal: "You can withdraw this permission at any time from this page or by writing to us. Withdrawing stops any future use. We will review anything currently in use and remove it from Ordift Studios' own channels and files where we reasonably can. We cannot recall material that is outside our control, such as a printed portfolio already handed over, a post already seen or a copy held by someone else.",
  accept: "I agree to the uses I have ticked for the photographs shown",
  decline: "No, please do not use these photographs for promotion",
} as const;
