// Builds the /connect gallery images from the approved originals, entirely locally (no upload, no external service).
//
//   node scripts/connect-portfolio/build-images.mjs "<folder holding the 15 approved originals>"
//
// For each approved photograph it writes responsive AVIF + WebP files to public/connect/portfolio/ and regenerates
// src/app/connect/portfolioImages.generated.ts (dimensions, average colour, file widths, alt text). Metadata (EXIF, GPS, camera and
// edit-software tags) is NOT carried into the web files, colours are converted to sRGB, orientation is applied, and nothing is stretched:
// every output keeps the original aspect ratio. The ONLY pixel-level change anywhere is the optional `crop` below (a plain trim, no retouching).
// The original photographs are only ever read, never modified, moved or deleted.
//
// CONTENT-HASHED FILENAMES: every file is named <slug>-<hash>-<width>.<format>, where <hash> is the first 8 hex characters of a SHA-256 over the
// source file's bytes plus the processing settings (crop, widths, quality). Replace a photograph, or change how it is processed, and its URL changes
// by itself, so no visitor, browser or CDN can keep showing the old picture under the old address. Old files are removed because this script clears
// its own output folder (public/connect/portfolio only) before writing.
//
// THE LIST BELOW IS THE APPROVED SELECTION (Founder, 15 photographs) AND THE GALLERY ORDER. It is the one place to change either.
// The order separates photographs from the same event or session and alternates subjects and tones, reading left-to-right, top-to-bottom.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WIDTHS = [480, 960, 1600];            // 480: grid on small phones; 960: grid on high-density phones and the enlarged view on phones; 1600: enlarged view on large screens
const QUALITY = { avif: 50, webp: 76 };
const PIPELINE_VERSION = 1;                 // bump to force new URLs for every photograph (e.g. after changing the way files are produced)

const SOURCES = [
  { file: "068A4524-Edit 2.JPG", slug: "headscarf-studio-portrait", alt: "Portrait of a woman in a dark green headscarf, looking upward against a soft grey studio backdrop" },
  { file: "ChingyJay-1.JPG", slug: "red-crochet-rock-blue-sky", alt: "A woman in a red crochet top and trousers poses with her hands raised on a rocky outcrop against a clear blue sky" },
  { file: "DH-FreeVidShoot-220.jpg", slug: "white-gown-church-chandeliers", alt: "A woman in a flowing white gown and cape stands in a stone church beneath ornate chandeliers, with stained-glass windows behind her" },
  { file: "Ben&Precious_HD-9.jpg", slug: "bridal-party-white-bed", alt: "A bridal party of nine smiling women in blush satin robes and white pyjamas poses together on a white bed in a bright bedroom" },
  { file: "OS@26-1.JPG", slug: "studio-patterned-trousers", alt: "Full-length studio portrait of a woman in a black top and red and white patterned wide-leg trousers against a dark backdrop" },
  { file: "IMG_7020.jpg", slug: "britannia-medical-centre-building", alt: "The glass-fronted entrance and angled facade of the Britannia Medical Centre building under a deep blue sky" },
  { file: "IMG_7985-Edit.jpg", slug: "studio-portrait-man-suspenders", alt: "Studio portrait of a bearded man in a dark cap, suspenders and jeans, seated on a chair against a deep brown backdrop" },
  { file: "GIFT-7.JPG", slug: "footbridge-dusk-portrait", alt: "A woman with burgundy hair, a white turtleneck and a black sleeveless coat stands on a footbridge at dusk, holding a small white handbag" },
  { file: "EllaJacobsLR-10.jpg", slug: "red-backdrop-stool", alt: "A woman in a blush top and sheer lace trousers poses beside a black stool against a deep red backdrop" },
  { file: "DHExperience 2020-83.jpg", slug: "singer-stage-light-beams", alt: "A singer in a blue lace-trimmed gown performs at a microphone on a stage crossed by beams of light" },
  { file: "Esposa-3.JPG", slug: "smiling-portrait-glasses", alt: "Close-up portrait of a smiling woman in large square glasses, braided hair and a red high-neck top against a lilac backdrop" },
  { file: "Ben&Precious_HD-23.jpg", slug: "couple-ballroom-chandelier", alt: "A man in a black tuxedo and a woman in a blush-pink gown holding white flowers stand beneath a large crystal chandelier in a ballroom" },
  // Trim of the thin white border the original has on its left and right edges (measured: about 70 px and 114 px of 4898; trimmed with a small margin). Pixels inside the trim are untouched.
  { file: "IMG_7939-Edit.jpg", slug: "turquoise-editorial-hat", alt: "A woman in a black hat and black bodysuit reclines in a chair against a bright turquoise backdrop", crop: { left: 76, right: 118 } },
  { file: "DrBenAmpaduGRAD-6.jpg", slug: "graduation-campus-lawn", alt: "A man in a navy suit and a kente graduation stole stands beside a smiling woman in a pink dress and graduation cap on a campus lawn" },
  { file: "JoeAsareBook-15.jpg", slug: "book-cover-discover-your-best-fit-career", alt: "Close-up of the red cover of the book Discover Your Best Fit Career" },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "public/connect/portfolio");
const manifestPath = join(root, "src/app/connect/portfolioImages.generated.ts");
const srcDir = process.argv[2];
if (!srcDir) { console.error("usage: node scripts/connect-portfolio/build-images.mjs <folder with the approved originals>"); process.exit(2); }

const present = new Set(readdirSync(srcDir));
const missing = SOURCES.filter((s) => !present.has(s.file)).map((s) => s.file);
if (missing.length) { console.error("Missing approved originals (nothing was substituted):\n  " + missing.join("\n  ")); process.exit(1); }

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) rmSync(join(outDir, f));        // only this tool's own output folder: regenerate from a clean state

const records = [];
for (const s of SOURCES) {
  const input = join(srcDir, s.file);
  const open = () => sharp(input, { limitInputPixels: false });
  const meta = await open().metadata();
  const swap = (meta.orientation ?? 1) >= 5;                           // EXIF orientation 5-8 means the stored pixels are rotated a quarter turn
  const fullW = swap ? meta.height : meta.width;
  const fullH = swap ? meta.width : meta.height;
  const c = { left: 0, right: 0, top: 0, bottom: 0, ...(s.crop ?? {}) };
  const w0 = fullW - c.left - c.right;
  const h0 = fullH - c.top - c.bottom;
  const source = () => (s.crop ? open().rotate().extract({ left: c.left, top: c.top, width: w0, height: h0 }) : open().rotate());
  const widths = [...new Set(WIDTHS.map((w) => Math.min(w, w0)))];     // never enlarge a smaller original

  const hash = createHash("sha256").update(readFileSync(input)).update(JSON.stringify({ v: PIPELINE_VERSION, crop: s.crop ?? null, widths, QUALITY })).digest("hex").slice(0, 8);
  const id = `${s.slug}-${hash}`;
  for (const w of widths) {
    const base = source().resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: QUALITY.avif, effort: 4 }).toFile(join(outDir, `${id}-${w}.avif`));
    await base.clone().webp({ quality: QUALITY.webp, effort: 5 }).toFile(join(outDir, `${id}-${w}.webp`));
  }
  const px = await source().resize(1, 1, { fit: "cover" }).removeAlpha().raw().toBuffer();
  const color = "#" + [...px.subarray(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join("");
  const h = Math.round((h0 / w0) * widths[widths.length - 1]);
  records.push({ id, source: s.file, alt: s.alt, width: widths[widths.length - 1], height: h, color, widths, hash, ...(s.crop ? { crop: s.crop } : {}) });
  console.log(`${s.file}  ${fullW}x${fullH}${s.crop ? `  (trim L${c.left} R${c.right})` : ""}  ->  ${id}  [${widths.join(", ")}]`);
}

const body = `// GENERATED by scripts/connect-portfolio/build-images.mjs: do not edit by hand. Re-run the script to change the selection, order or alt text.
// The 15 photographs approved for the /connect gallery, in gallery order. "source" is the original filename, kept as a provenance record only (it is never shown).
export type PortfolioImageRecord = {
  id: string;                       // file stem under /connect/portfolio/: <slug>-<content hash>
  source: string;                   // original filename
  alt: string;                      // descriptive alternative text
  width: number;                    // pixel size of the largest file (used for the aspect ratio)
  height: number;
  color: string;                    // average colour, shown while the photograph loads
  widths: readonly number[];        // available file widths
  hash: string;                     // first 8 hex characters of SHA-256(source bytes + processing settings); changes whenever the photograph or its processing changes
  crop?: { left?: number; right?: number; top?: number; bottom?: number };   // plain edge trim applied to the original, in pixels
};

export const PORTFOLIO_IMAGES: readonly PortfolioImageRecord[] = ${JSON.stringify(records, null, 2)};
`;
writeFileSync(manifestPath, body);
console.log(`\n${records.length} photographs -> ${outDir}\nmanifest -> ${manifestPath}`);
