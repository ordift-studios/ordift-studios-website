import type { SectionEntry } from "./schema";

// The nine Founder-approved custom-quotation notes (Phase 2D), keyed by the exact section key. Heading and description are copied EXACTLY from the approved draft (including the curly apostrophes)
// and are locked by a fingerprint test. A note is an editorial invitation for bespoke enquiries: it is never a priced package, add-on or calculated service.
//   availableIn: ["ghana"]  the note advertises film (or a film combination), so it is never merged into a Qatar card (Qatar is photography-only).
//   markets.qatar           a Founder-approved Qatar-only wording for the Commercial note (photography only); Ghana keeps the original text.
export const QUOTATION_NOTES: Record<string, SectionEntry> = {
  // 01 Personal Portrait Sessions
  personal_sessions: {
    status: "approved",
    customQuotationHeading: "A Portrait Experience, Personally Yours",
    customQuotationNote: "Every individual has a story worth capturing. For portrait experiences beyond our featured collections, Ordift Studios offers tailored quotations shaped around your creative vision, preferred setting and photographic requirements.",
  },
  // 02 Wedding Photography
  wedding_photography: {
    status: "approved",
    customQuotationHeading: "Your Celebration, Your Story",
    customQuotationNote: "Every love story is beautifully unique. For celebrations requiring photography coverage beyond our featured collections, we prepare tailored quotations reflecting your wedding itinerary, coverage requirements and the moments you wish to preserve.",
  },
  // 03 Wedding Film
  wedding_film: {
    status: "approved",
    availableIn: ["ghana"],
    customQuotationHeading: "Your Story, Beautifully Told in Motion",
    customQuotationNote: "Every celebration carries its own rhythm and emotion. For wedding film requirements beyond our featured collections, we offer tailored quotations based on your celebration’s schedule, filming needs and envisioned cinematic deliverables.",
  },
  // 04 Wedding Photography & Film
  wedding_photography_film: {
    status: "approved",
    availableIn: ["ghana"],
    customQuotationHeading: "One Beautiful Story, Thoughtfully Preserved",
    customQuotationNote: "Some celebrations call for a more personalized visual experience. Our tailored photography and film quotations are thoughtfully developed around your wedding itinerary, production requirements and the visual story you wish to tell.",
  },
  // 05 Event Photography
  event_photography: {
    status: "approved",
    customQuotationHeading: "Every Occasion Deserves Its Own Perspective",
    customQuotationNote: "From intimate gatherings to elaborate celebrations, every occasion has its defining moments. For photography requirements beyond our featured collections, we prepare tailored quotations reflecting your event’s scale, coverage needs and photographic priorities.",
  },
  // 06 Event Film
  event_film: {
    status: "approved",
    availableIn: ["ghana"],
    customQuotationHeading: "The Moments, The Movement, The Memories",
    customQuotationNote: "Every event unfolds with its own atmosphere and energy. For cinematic coverage beyond our featured collections, we offer tailored quotations shaped around your event schedule, filming requirements and intended film deliverables.",
  },
  // 07 Event Photography & Film
  event_photography_film: {
    status: "approved",
    availableIn: ["ghana"],
    customQuotationHeading: "Your Occasion, Beautifully Captured in Every Form",
    customQuotationNote: "For occasions requiring a more personalized combination of photography and film, Ordift Studios prepares tailored quotations reflecting your event’s scale, creative direction, coverage requirements and agreed visual deliverables.",
  },
  // 08 Corporate Portraits & Headshots
  corporate_headshots: {
    status: "approved",
    customQuotationHeading: "Professional Imagery, Thoughtfully Tailored",
    customQuotationNote: "Every professional and organization has a distinctive identity. For individual, executive or team portrait requirements beyond our featured collections, we prepare tailored quotations based on your team size, preferred visual style, session requirements and organizational needs.",
  },
  // 09 Commercial Production
  commercial: {
    status: "approved",
    customQuotationHeading: "Your Vision, Our Creative Perspective",
    customQuotationNote: "Every brand has a unique story to communicate. From product and catalogue imagery to commercial photography and film, we prepare tailored quotations based on your creative brief, production scope, project requirements and agreed deliverables.",
    // Qatar-only variation approved by the Founder: the same note without film wording.
    markets: {
      qatar: {
        customQuotationHeading: "Your Vision, Our Creative Perspective",
        customQuotationNote: "Every brand has a unique story to communicate. From product and catalogue imagery to commercial photography, we prepare tailored quotations based on your creative brief, production scope, project requirements and agreed deliverables.",
      },
    },
  },
};
