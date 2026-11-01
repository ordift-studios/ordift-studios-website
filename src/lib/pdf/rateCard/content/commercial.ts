import type { Entry } from "./schema";

// Luxury Editorial descriptions for the commercial and catalogue packages, copied EXACTLY from Ordift_Content_Master.md (2026-10-28 handoff), by exact package key.
// status: "approved" for all ten commercial and catalogue descriptions — the Founder approved them exactly as presented in the Content Master (Phase 2C handoff). They were previously "reviewed_draft" (3)
// or "draft" (7); only the status changed, never the wording.
// Editorial text only: prices, hours, counts and team sizes come from the selling tables. Do not edit this wording without the Founder's approval.
export const COMMERCIAL: Record<string, Entry> = {
  // 38. Focused Production — Photography — Founder approved (Phase 2C)
  "com-photography-focused": { status: "approved", description: "An intentional commercial photography experience designed to bring your brand, product or creative vision into focus. Refined imagery crafted to communicate quality, character and distinction." },
  // 39. Full Day Production — Photography — Founder approved (Phase 2C)
  "com-photography-full_day": { status: "approved", description: "A comprehensive commercial photography experience where creative vision and thoughtful execution come together to create imagery that reflects your brand's identity and ambition." },
  // 40. Extended Production — Photography — Founder approved (Phase 2C)
  "com-photography-extended": { status: "approved", description: "Our most expansive commercial photography collection, designed for brands seeking a richer visual narrative across multiple products, concepts or campaign requirements." },
  // 41. Focused Production — Film — Founder approved (Phase 2C)
  "com-film-focused": { status: "approved", description: "A considered commercial film production bringing your brand or creative concept into motion through purposeful cinematic storytelling." },
  // 42. Full Day Production — Film — Founder approved (Phase 2C)
  "com-film-full_day": { status: "approved", description: "A comprehensive commercial film experience, thoughtfully shaping movement, atmosphere and visual storytelling around your brand identity." },
  // 43. Extended Production — Film — Founder approved (Phase 2C)
  "com-film-extended": { status: "approved", description: "An expansive commercial film production designed to explore multiple creative concepts and express your brand story with depth and distinction." },
  // 44. Focused Production — Photography & Film — Founder approved (Phase 2C)
  "com-photography_film-focused": { status: "approved", description: "A focused commercial production uniting refined photography and cinematic film to express your brand or creative concept through stillness and motion." },
  // 45. Full Day Production — Photography & Film — Founder approved (Phase 2C)
  "com-photography_film-full_day": { status: "approved", description: "A comprehensive visual production combining commercial photography and film to communicate your brand identity with cohesion and distinction." },
  // 46. Extended Production — Photography & Film — Founder approved (Phase 2C)
  "com-photography_film-extended": { status: "approved", description: "Our most expansive combined commercial production, bringing photography and film together to create a cohesive visual narrative across your campaign concepts." },
  // 47. Product & Catalogue Photography — Founder approved (Phase 2C)
  "com-catalogue": { status: "approved", description: "Elevated product imagery that reveals the craftsmanship, character and defining details of your collection, presented with clarity, consistency and distinction.",
    // The pricing sentence below was approved separately by the Founder (Phase 2 brief §5); the description above was approved in Phase 2C.
    appendInclusions: ["Final pricing depends on image quantity, production complexity and the agreed project brief. Volume-adjusted rates may apply."]
  },
};
