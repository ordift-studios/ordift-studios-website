import type { Entry } from "./schema";

// Luxury Editorial descriptions for the events packages, copied EXACTLY from Ordift_Content_Master.md (2026-10-28 handoff), by exact package key.
// status: "approved" = previously reviewed; "reviewed_draft" = reviewed commercial draft, exact-text approval still pending; "draft" = NEW proposal awaiting Founder approval (held back from every card).
// Editorial text only: prices, hours, counts and team sizes come from the selling tables. Do not edit this wording without the Founder's approval.
export const EVENTS: Record<string, Entry> = {
  // 17. Focused — Previously reviewed
  "event-photography-focused": { status: "approved", description: "A thoughtfully captured collection of the moments that matter, preserving the atmosphere and defining details of your occasion." },
  // 18. Half Day — Previously reviewed
  "event-photography-half_day": { status: "approved", description: "An elegant visual account of your occasion, capturing the meaningful interactions, atmosphere and memorable details as they unfold." },
  // 19. Full Day — Previously reviewed
  "event-photography-full_day": { status: "approved", description: "A richer photographic narrative of your celebration, thoughtfully preserving the people, connections and defining moments that make it extraordinary." },
  // 20. Extended — Previously reviewed
  "event-photography-extended": { status: "approved", description: "An expansive photographic experience designed to preserve the atmosphere, energy and unfolding story of your event with greater depth." },
  // 21. Full Event — Previously reviewed
  "event-photography-full_event": { status: "approved", description: "From the opening moments to the closing celebrations, a comprehensive photographic collection documenting the atmosphere, emotion and details of your event." },
  // 22. Round-the-Clock — Previously reviewed
  "event-photography-round_the_clock": { status: "approved", description: "Our most extensive event photography collection, thoughtfully documenting the atmosphere, defining moments and unfolding story of your occasion across two days." },
  // 23. Focused — Previously reviewed
  "event-film-focused": { status: "approved", description: "A cinematic glimpse of your occasion, preserving its defining moments in a thoughtfully crafted highlight film." },
  // 24. Half Day — Previously reviewed
  "event-film-half_day": { status: "approved", description: "A considered film collection capturing the atmosphere, movement and memorable moments of your event." },
  // 25. Full Day — Previously reviewed
  "event-film-full_day": { status: "approved", description: "A cinematic narrative of your celebration, bringing together the moments and emotions that define the occasion." },
  // 26. Extended — Previously reviewed
  "event-film-extended": { status: "approved", description: "An expansive film collection capturing the energy, atmosphere and unfolding story of your event." },
  // 27. Full Event — Previously reviewed
  "event-film-full_event": { status: "approved", description: "A comprehensive cinematic record of your occasion, preserving the atmosphere and defining moments throughout the celebration." },
  // 28. Round-the-Clock — Previously reviewed
  "event-film-round_the_clock": { status: "approved", description: "Our most extensive event film collection, preserving the unfolding story of your occasion across two days through cinematic highlights and a documentary edit." },
  // 29. Focused — Previously reviewed
  "event-photography_film-focused": { status: "approved", description: "One occasion, two perspectives. A thoughtfully crafted collection of photography and film preserving the moments that matter." },
  // 30. Half Day — Previously reviewed
  "event-photography_film-half_day": { status: "approved", description: "A beautiful visual narrative combining still imagery and cinematic highlights to capture the essence of your celebration." },
  // 31. Full Day — Previously reviewed
  "event-photography_film-full_day": { status: "approved", description: "An elevated visual collection that brings photography and film together to preserve the atmosphere, emotions and defining moments of your event." },
  // 32. Extended — Previously reviewed
  "event-photography_film-extended": { status: "approved", description: "A richer visual narrative, combining the artistry of photography and film to document your event with depth and distinction." },
  // 33. Full Event — Previously reviewed
  "event-photography_film-full_event": { status: "approved", description: "A comprehensive photography and film collection, preserving the people, atmosphere and unfolding story of your celebration." },
  // 34. Round-the-Clock — Previously reviewed
  "event-photography_film-round_the_clock": { status: "approved", description: "Our most expansive event collection, bringing photography and film together to document your occasion across two days, including cinematic highlights and a documentary edit." },
};
