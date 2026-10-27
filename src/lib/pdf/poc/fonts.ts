// LOCAL PROOF OF CONCEPT (branch pdf-poc, never deployed). Registers the static, Latin-subset instances of Fraunces and Inter (SIL OFL 1.1, licences beside the files)
// that react-pdf embeds in the PDF. react-pdf needs static fonts; the website's own fonts are variable, so the instances were cut from the same upstream files.
import { Font } from "@react-pdf/renderer";

let done = false;
export function registerPocFonts(base: string) {
  if (done) return;
  Font.register({ family: "Fraunces", fonts: [{ src: `${base}/Fraunces-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Fraunces-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "Inter", fonts: [{ src: `${base}/Inter-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Inter-Medium.ttf`, fontWeight: 500 }, { src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 }] });
  Font.registerHyphenationCallback((word) => [word]); // no automatic hyphenation: brand copy breaks at spaces only
  done = true;
}
