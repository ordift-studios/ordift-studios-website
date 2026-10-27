// Registers the static, Latin-subset instances of Fraunces and Inter (SIL OFL 1.1; licences beside the files in public/fonts/pdf) that react-pdf embeds.
import { Font } from "@react-pdf/renderer";

let done = false;
export function registerBrandFonts(base: string) {
  if (done) return;
  Font.register({ family: "Fraunces", fonts: [{ src: `${base}/Fraunces-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Fraunces-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "Inter", fonts: [{ src: `${base}/Inter-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Inter-Medium.ttf`, fontWeight: 500 }, { src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 }] });
  Font.registerHyphenationCallback((word) => [word]); // brand copy breaks at spaces only
  done = true;
}
