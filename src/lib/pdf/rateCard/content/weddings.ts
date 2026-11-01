import type { Entry } from "./schema";

// Luxury Editorial descriptions for the weddings packages, copied EXACTLY from Ordift_Content_Master.md (2026-10-28 handoff), by exact package key.
// status: "approved" = previously reviewed; "reviewed_draft" = reviewed commercial draft, exact-text approval still pending; "draft" = NEW proposal awaiting Founder approval (held back from every card).
// Editorial text only: prices, hours, counts and team sizes come from the selling tables. Do not edit this wording without the Founder's approval.
export const WEDDINGS: Record<string, Entry> = {
  // 05. The Chapter — Previously reviewed
  "wedding-photography-chapter": { status: "approved", description: "Every love story begins with a chapter worth remembering. An intimate collection devoted to preserving the beauty, emotion and meaningful moments of your celebration." },
  // 06. The Narrative — Previously reviewed
  "wedding-photography-narrative": { status: "approved", description: "A beautiful story deserves to be told beyond a single moment. A thoughtfully curated collection that captures the unfolding emotions, connections and unforgettable details of your wedding day." },
  // 07. The Chronicle — Previously reviewed
  "wedding-photography-chronicle": { status: "approved", description: "From the quiet anticipation to the grandest celebrations, every detail becomes part of your story. An expansive photographic collection preserving the atmosphere, elegance and emotions of your day." },
  // 08. The Archive — Previously reviewed
  "wedding-photography-archive": { status: "approved", description: "Some stories deserve more than photographs; they deserve a legacy. Our most comprehensive wedding photography collection, preserving the beauty and emotion of your celebration across two unforgettable days." },
  // 09. The Chapter — Previously reviewed
  "wedding-film-chapter": { status: "approved", description: "The beginning of your forever, preserved in motion. A cinematic reflection of the moments, emotions and intimate details that make your celebration uniquely yours." },
  // 10. The Narrative — Previously reviewed
  "wedding-film-narrative": { status: "approved", description: "A love story told through movement, atmosphere and emotion. A thoughtfully crafted film collection preserving the unforgettable moments as your celebration unfolds." },
  // 11. The Chronicle — Previously reviewed
  "wedding-film-chronicle": { status: "approved", description: "Every glance, every embrace, every celebration woven into a cinematic story. An expansive film collection designed to preserve the atmosphere and emotion of your wedding day." },
  // 12. The Archive — Previously reviewed
  "wedding-film-archive": { status: "approved", description: "A celebration too meaningful to be confined to a single day. Our most extensive wedding film collection, preserving the depth, beauty and unfolding story of your celebration across two days." },
  // 13. The Chapter — Previously reviewed
  "wedding-photography_film-chapter": { status: "approved", description: "Two art forms, one beautiful story. An intimate collection combining timeless photography with cinematic storytelling to preserve the moments that mark the beginning of your forever." },
  // 14. The Narrative — Previously reviewed
  "wedding-photography_film-narrative": { status: "approved", description: "Your love story, beautifully captured in stillness and motion. A considered collection that brings together the artistry of photography and film to preserve every meaningful chapter of your celebration." },
  // 15. The Chronicle — Previously reviewed
  "wedding-photography_film-chronicle": { status: "approved", description: "A complete visual celebration of your love story. Through evocative photographs and thoughtfully crafted films, the emotions, details and defining moments of your wedding become memories to revisit." },
  // 16. The Archive — Previously reviewed
  "wedding-photography_film-archive": { status: "approved", description: "The ultimate expression of your wedding story. An extensive collection of photography and film, preserving the beauty, emotion and significance of your celebration across two unforgettable days." },
};
