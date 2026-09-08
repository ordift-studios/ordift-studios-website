// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08).
// Pure, zero-import media-type catalogue for talent_media_assets.

export const TALENT_MEDIA_TYPES = ["portfolio_image", "portfolio_video", "comp_card", "other"] as const;
export type TalentMediaType = (typeof TALENT_MEDIA_TYPES)[number];

export function isValidTalentMediaType(value: string): value is TalentMediaType {
  return (TALENT_MEDIA_TYPES as readonly string[]).includes(value);
}
