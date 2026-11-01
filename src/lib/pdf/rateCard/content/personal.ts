import type { Entry } from "./schema";

// Luxury Editorial descriptions for the personal sessions packages, copied EXACTLY from Ordift_Content_Master.md (2026-10-28 handoff), by exact package key.
// status: "approved" = previously reviewed; "reviewed_draft" = reviewed commercial draft, exact-text approval still pending; "draft" = NEW proposal awaiting Founder approval (held back from every card).
// Editorial text only: prices, hours, counts and team sizes come from the selling tables. Do not edit this wording without the Founder's approval.
export const PERSONAL: Record<string, Entry> = {
  // 01. The Essential Portrait — Previously reviewed
  "ps-1h": { status: "approved", description: "An intimate portrait experience, thoughtfully crafted to capture your individuality with elegance and authenticity." },
  // 02. The Signature Portrait — Previously reviewed
  "ps-2h": { status: "approved", description: "A considered portrait experience with room for creative expression, revealing the character and confidence behind every frame." },
  // 03. The Editorial Experience — Previously reviewed
  "ps-3h": { status: "approved", description: "An elevated portrait experience where creative direction and thoughtful imagery come together to tell your story with depth and distinction." },
  // 04. The Portrait Collection — Previously reviewed
  "ps-4h": { status: "approved", description: "Our most expansive personal portrait experience, created for those who seek a richer visual narrative and a distinctive collection of timeless imagery." },
};
