// Registers the static instances of Fraunces and Inter (Latin subsets) and IBM Plex Sans Arabic (static files, unmodified) that react-pdf embeds. All SIL OFL 1.1; licences and the Arabic font's
// source and checksums sit beside the files in public/fonts/pdf. IBM Plex Sans Arabic is the FALLBACK for Arabic script (see BODY_FONT): Latin text stays in Inter.
import { Font } from "@react-pdf/renderer";

export const BODY_FONT = ["Inter", "IBMPlexSansArabic"];

let done = false;
export function registerBrandFonts(base: string) {
  if (done) return;
  Font.register({ family: "Fraunces", fonts: [{ src: `${base}/Fraunces-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Fraunces-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "Inter", fonts: [{ src: `${base}/Inter-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Inter-Medium.ttf`, fontWeight: 500 }, { src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "IBMPlexSansArabic", fonts: [{ src: `${base}/IBMPlexSansArabic-Regular.ttf`, fontWeight: 400 }, { src: `${base}/IBMPlexSansArabic-Medium.ttf`, fontWeight: 500 }, { src: `${base}/IBMPlexSansArabic-SemiBold.ttf`, fontWeight: 600 }] });
  Font.registerHyphenationCallback((word) => [word]); // brand copy breaks at spaces only
  done = true;
}
