import { existsSync, readdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConnectView from "./ConnectView";
import ConnectContactSheet from "./ConnectContactSheet";
import { metadata } from "./page";
import { PORTFOLIO_IMAGES } from "./portfolioImages.generated";
import { fileUrl, getConnectGalleryImages, splitColumns, srcSet, type ConnectImage } from "./gallery";
import {
  BRAND_NAME, CALL_OPTIONS, CONNECT_URL, EMAIL, GALLERY_MIN_IMAGES, PORTFOLIO_FALLBACK_LINK, SOCIAL_LINKS, WEBSITE_LINK, WHATSAPP,
  mailtoHref, telHref, whatsappHref,
} from "./connectConfig";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const img = (n: number): ConnectImage => ({ id: `synthetic-${n}`, alt: `Synthetic photograph ${n}`, width: 1200, height: 1500, color: "#222222", widths: [480, 960, 1200] });
const many = (n: number) => Array.from({ length: n }, (_, i) => img(i + 1));
const html = (images: ConnectImage[]) => renderToStaticMarkup(createElement(ConnectView, { images }));
const realGallery = html(getConnectGalleryImages());
// What a visitor (or a screen reader) is given: text nodes plus the accessible attributes.
const visible = (markup: string) => [markup.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " "), ...[...markup.matchAll(/(?:alt|aria-label|title)="([^"]*)"/g)].map((m) => m[1])].join(" ");

describe("the confirmed contact arrangement", () => {
  it("uses the confirmed WhatsApp number with the approved message, as a standard wa.me link", () => {
    expect(WHATSAPP.number).toBe("447777371023");
    expect(WHATSAPP.display).toBe("+44 7777 371023");
    expect(WHATSAPP.message).toBe("Hello ORDIFT STUDIOS, I’d like to enquire about your services.");
    expect(whatsappHref()).toBe("https://wa.me/447777371023?text=Hello%20ORDIFT%20STUDIOS%2C%20I%E2%80%99d%20like%20to%20enquire%20about%20your%20services.");
  });
  it("offers Qatar and Ghana as two separate, explicit tel: links, with the confirmed numbers", () => {
    expect(CALL_OPTIONS.map((c) => [c.market, c.display, telHref(c.tel)])).toEqual([["Qatar", "+974 5510 4490", "tel:+97455104490"], ["Ghana", "+233 504 981 277", "tel:+233504981277"]]);
  });
  it("uses the enquiries mailbox with a subject that names ORDIFT STUDIOS", () => {
    expect(EMAIL.address).toBe("enquiries@ordiftstudios.com");
    expect(mailtoHref()).toBe("mailto:enquiries@ordiftstudios.com?subject=Enquiry%20via%20ORDIFT%20STUDIOS%20QR%20code");
  });
  it("the website button carries the agreed UTM parameters; the permanent URL is /connect", () => {
    expect(WEBSITE_LINK).toBe("https://ordiftstudios.com/?utm_source=qr&utm_medium=card&utm_campaign=connect");
    expect(CONNECT_URL).toBe("https://ordiftstudios.com/connect");
  });
  it("lists only the verified Instagram account: no TikTok, no placeholder", () => {
    expect(SOCIAL_LINKS).toEqual([{ label: "Instagram", href: "https://www.instagram.com/ordift_photographyyy/" }]);
    expect(read("./connectConfig.ts").replace(/\/\/.*$/gm, "")).not.toMatch(/tiktok/i);
  });
  it("contains no other telephone, WhatsApp or email address than the confirmed ones", () => {
    const code = read("./connectConfig.ts").replace(/\/\/.*$/gm, "");
    const numbers = new Set([...code.matchAll(/\+?\d[\d ]{8,}\d/g)].map((m) => m[0].replace(/\D/g, "")));
    expect([...numbers].sort()).toEqual(["233504981277", "447777371023", "97455104490"]);
    expect(new Set(code.match(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[a-z]+/g))).toEqual(new Set(["enquiries@ordiftstudios.com"]));
  });
});

describe("the landing page content", () => {
  const withGallery = html(many(10));
  const noGallery = html([]);
  it("has exactly three main options, in order: View Portfolio, Visit Website, Contact Us", () => {
    for (const m of [withGallery, noGallery]) {
      const nav = m.slice(m.indexOf("<nav"), m.indexOf("</nav>"));
      expect([...nav.matchAll(/(?:<a [^>]*>|<button [^>]*>)\s*([A-Za-z ]+?)\s*<svg/g)].map((x) => x[1])).toEqual(["View Portfolio", "Visit Website", "Contact Us"]);
    }
  });
  it("View Portfolio scrolls to the gallery on the same page when enough approved photographs exist", () => {
    expect(withGallery).toContain('href="#portfolio"');
    expect(withGallery).toContain('id="portfolio"');
    expect(withGallery.match(/<picture>/g)).toHaveLength(10);
  });
  it("with too few approved photographs the gallery is omitted and View Portfolio opens the website's portfolio instead; nothing is invented", () => {
    for (const n of [0, GALLERY_MIN_IMAGES - 1]) {
      const m = html(many(n));
      expect(m).not.toContain('id="portfolio"');
      expect(m).toContain(`href="${PORTFOLIO_FALLBACK_LINK.replace(/&/g, "&amp;")}"`);
    }
  });
  it("shows Instagram as a small secondary link and no TikTok", () => {
    expect(noGallery).toContain('href="https://www.instagram.com/ordift_photographyyy/"');
    expect(noGallery).toMatch(/rel="noopener noreferrer"/);
    expect(visible(noGallery)).not.toMatch(/tiktok/i);
  });
  it("contains no prototype notes, developer wording or placeholders a visitor could see", () => {
    for (const m of [withGallery, noGallery]) expect(visible(m)).not.toMatch(/prototype|placeholder|to be confirmed|lorem|sample|todo|coming soon/i);
  });
  it("always writes the brand as ORDIFT STUDIOS: no mixed forms in text, labels or alternative text", () => {
    for (const m of [withGallery, noGallery]) {
      const v = visible(m);
      expect(v).toContain(BRAND_NAME);
      expect(v).not.toMatch(/Ordift Studios|ORDIFT Studios|Ordift STUDIOS|ordift studios/);
    }
    expect(read("./connectConfig.ts")).not.toMatch(/"[^"]*(Ordift Studios|ORDIFT Studios)[^"]*"/);
  });
  it("the contact panel carries the three contact methods as plain links", () => {
    const m = renderToStaticMarkup(createElement(ConnectContactSheet));
    expect(m).toContain(`href="${whatsappHref()}"`);
    expect(m).toContain('href="tel:+97455104490"');
    expect(m).toContain('href="tel:+233504981277"');
    expect(m).toContain(`href="${mailtoHref()}"`);
    expect(m).toContain("Call: choose a market");
    expect(m).toContain("Call Qatar"); expect(m).toContain("Call Ghana");
    expect(m).not.toMatch(/aria-pressed|<select|checked/);                                       // nothing is pre-selected: the visitor chooses a market by tapping a number
    expect(m).toMatch(/<dialog[^>]*aria-labelledby="connect-contact-title"/);
  });
});

describe("page metadata, sitemap and the UK WhatsApp number's scope", () => {
  it("is noindex, titled with the brand in capitals, and shares the permanent URL", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe("ORDIFT STUDIOS — Connect");
    expect((metadata.openGraph as { url?: string }).url).toBe("https://ordiftstudios.com/connect");
  });
  it("is not in the XML sitemap (the sitemap lists its routes explicitly)", () => {
    expect(read("../sitemap.ts")).not.toMatch(/connect/i);
  });
  it("the UK WhatsApp number appears only in this page's configuration, never in any quotation, PDF or letterhead code", () => {
    const hits = [read("../../lib/commercial/quotationIssuance.ts"), read("../../lib/pdf/rateCard/RateCardDocument.tsx")].join("\n");
    expect(hits).not.toMatch(/7777|447777/);
  });
});

const APPROVED = [
  "068A4524-Edit 2.JPG", "ChingyJay-1.JPG", "Ben&Precious_HD-23.jpg", "Ben&Precious_HD-9.jpg", "IMG_7020.jpg", "DHExperience 2020-83.jpg", "DH-FreeVidShoot-220.jpg", "OS@26-1.JPG",
  "GIFT-7.JPG", "EllaJacobsLR-10.jpg", "DrBenAmpaduGRAD-6.jpg", "JoeAsareBook-15.jpg", "Esposa-3.JPG", "IMG_7985-Edit.jpg", "IMG_7939-Edit.jpg",     // the final approved 15 (membership, not order)
];
// Removed from the gallery on the Founder's instruction (4 Nov), plus the three that were never approved. Only the generated gallery assets are affected: the originals are untouched.
const REMOVED = ["ChingyJay-7.JPG", "ChingyJay-2.JPG", "ChingyJay-6.JPG", "A9378A58-1D29-40F9-B6B1-7AF03ADADD73.jpeg", "068A4533-Edit.JPG"];
const NEVER_APPROVED = ["Franklina Pre-Birthday-25.jpg", "GIFT-1.jpg"];
const dir = new URL("../../../public/connect/portfolio/", import.meta.url);

describe("the approved gallery photographs (exactly the final 15; nothing else; nothing invented)", () => {
  it("contains exactly the final 15 approved photographs, once each, and none of the five removed or the others never approved", () => {
    const sources = PORTFOLIO_IMAGES.map((p) => p.source);
    expect(sources).toHaveLength(15);
    expect(new Set(sources).size).toBe(15);
    expect([...sources].sort()).toEqual([...APPROVED].sort());
    for (const x of [...REMOVED, ...NEVER_APPROVED]) expect(sources).not.toContain(x);
    expect(new Set(PORTFOLIO_IMAGES.map((p) => p.id)).size).toBe(15);
    expect(sources.filter((x) => x.startsWith("ChingyJay"))).toEqual(["ChingyJay-1.JPG"]);   // only one photograph from that series
  });
  it("leaves no generated file for a removed photograph (nothing in the output folder that the manifest does not name)", () => {
    const names = readdirSync(dir);
    for (const stem of ["crochet-derelict", "crochet-coastal", "crochet-bamboo", "short-pink-hair", "abaya-studio"]) expect(names.filter((n) => n.includes(stem)), stem).toEqual([]);
    expect(names.every((n) => PORTFOLIO_IMAGES.some((p) => n.startsWith(`${p.id}-`)))).toBe(true);
  });
  it("names every file by its content hash, so a replaced or reprocessed photograph gets a new address", () => {
    for (const p of PORTFOLIO_IMAGES) {
      expect(p.hash, p.id).toMatch(/^[0-9a-f]{8}$/);
      expect(p.id, p.id).toMatch(new RegExp(`^[a-z0-9-]+-${p.hash}$`));
    }
    expect(new Set(PORTFOLIO_IMAGES.map((p) => p.hash)).size).toBe(15);                    // different photographs never share a hash
    expect(readFileSync(new URL("../../../scripts/connect-portfolio/build-images.mjs", import.meta.url), "utf8")).toMatch(/createHash\("sha256"\)\.update\(readFileSync\(input\)\)/);   // the hash covers the source bytes
  });
  it("trims only the thin white border of IMG_7939-Edit (a plain crop, 4898 px wide to 4704 px) and no other photograph", async () => {
    const cropped = PORTFOLIO_IMAGES.filter((p) => p.crop);
    expect(cropped.map((p) => p.source)).toEqual(["IMG_7939-Edit.jpg"]);
    expect(cropped[0].crop).toEqual({ left: 76, right: 118 });
    const p = cropped[0];
    const { data, info } = await sharp(new URL(`${p.id}-${Math.max(...p.widths)}.webp`, dir).pathname).raw().toBuffer({ resolveWithObject: true });
    const col = (x: number) => { let t = 0; for (let y = 0; y < info.height; y++) for (let c = 0; c < 3; c++) t += data[(y * info.width + x) * info.channels + c]; return t / (info.height * 3); };
    for (const x of [0, 1, 2, info.width - 1, info.width - 2, info.width - 3]) expect(col(x), `edge column ${x}`).toBeLessThan(215);   // a white border would read about 255
    expect(info.width / info.height).toBeCloseTo(4704 / 3265, 2);
  });
  it("every photograph has its AVIF and WebP files at every declared width, and the folder holds nothing else", () => {
    const expected = new Set<string>();
    for (const p of PORTFOLIO_IMAGES) for (const w of p.widths) for (const f of ["avif", "webp"] as const) {
      const name = fileUrl(p, w, f).split("/").pop()!;
      expected.add(name);
      expect(existsSync(new URL(name, dir)), name).toBe(true);
    }
    expect(new Set(readdirSync(dir))).toEqual(expected);
  });
  it("keeps each photograph's own proportions, strips metadata, and is no larger than 1600px wide", async () => {
    for (const p of PORTFOLIO_IMAGES) {
      const widest = Math.max(...p.widths);
      expect(widest).toBeLessThanOrEqual(1600);
      for (const f of ["avif", "webp"] as const) {
        const m = await sharp(new URL(fileUrl(p, widest, f).split("/").pop()!, dir).pathname).metadata();
        expect(m.width, `${p.id} ${f}`).toBe(widest);
        expect(Math.abs((m.height ?? 0) - Math.round((p.height / p.width) * widest)), `${p.id} ${f} height`).toBeLessThanOrEqual(1);
        expect(m.exif, `${p.id} ${f} exif`).toBeUndefined();
      }
    }
  });
  it("gives every photograph descriptive alternative text that does not expose a filename and keeps the brand style", () => {
    for (const p of PORTFOLIO_IMAGES) {
      expect(p.alt.length, p.id).toBeGreaterThan(25);
      expect(p.alt.length, p.id).toBeLessThan(200);
      expect(p.alt, p.id).not.toMatch(/\.(jpe?g|png)\b|IMG_|\d{4}[A-Z]/i);
      expect(p.alt, p.id).not.toMatch(/Ordift Studios|ORDIFT Studios/);
    }
  });
  it("the real gallery renders all 15 in the page, with View Portfolio pointing at it and every image reference being a local /connect/portfolio file", () => {
    expect(realGallery).toContain('href="#portfolio"');
    expect(realGallery.match(/<picture>/g)).toHaveLength(15);
    const refs = [...realGallery.matchAll(/(?:src|srcSet)="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(" ")[0]));
    const photoRefs = refs.filter((r) => r.includes("portfolio"));
    expect(photoRefs.length).toBeGreaterThan(15 * 4);
    for (const r of photoRefs) { expect(r).toMatch(/^\/connect\/portfolio\/[a-z0-9-]+-[0-9a-f]{8}-\d+\.(avif|webp)$/); expect(existsSync(new URL(r.split("/").pop()!, dir)), r).toBe(true); }
    expect(realGallery).not.toMatch(/https?:\/\/[^"]*\.(jpe?g|png|webp|avif)/);                  // no remote image anywhere
  });
  it("every photograph is lazy-loaded with its dimensions declared, so nothing shifts and nothing is downloaded before it is needed", () => {
    const imgs = realGallery.match(/<img [^>]*>/g)!.filter((t) => t.includes("/connect/portfolio/"));
    expect(imgs).toHaveLength(15);
    for (const t of imgs) { expect(t).toContain('loading="lazy"'); expect(t).toMatch(/width="\d+"/); expect(t).toMatch(/height="\d+"/); expect(t).toMatch(/alt="[^"]{20,}"/); }
  });
  it("builds srcset lists from the declared widths only", () => {
    const a = img(1);
    expect(srcSet(a, "avif")).toBe("/connect/portfolio/synthetic-1-480.avif 480w, /connect/portfolio/synthetic-1-960.avif 960w, /connect/portfolio/synthetic-1-1200.avif 1200w");
    expect(srcSet(a, "webp", 900)).toBe("/connect/portfolio/synthetic-1-960.webp 960w, /connect/portfolio/synthetic-1-1200.webp 1200w");
  });
  it("lays the photographs out in two level columns that read in gallery order, without cropping", () => {
    const [l, r] = splitColumns(PORTFOLIO_IMAGES);
    expect(l.length + r.length).toBe(15);
    expect([l[0].id, r[0].id]).toEqual([PORTFOLIO_IMAGES[0].id, PORTFOLIO_IMAGES[1].id]);   // first row = photographs 1 and 2
    const order = (c: typeof l) => c.map((p) => PORTFOLIO_IMAGES.indexOf(p));
    for (const c of [order(l), order(r)]) expect(c).toEqual([...c].sort((x, y) => x - y));   // each column keeps gallery order
    const h = (c: typeof l) => c.reduce((s, p) => s + p.height / p.width, 0);
    expect(Math.abs(h(l) - h(r))).toBeLessThanOrEqual(Math.max(...PORTFOLIO_IMAGES.map((p) => p.height / p.width)));   // columns end within one photograph of each other
  });
  it("separates photographs from the same event (the two Ben&Precious photographs and the two DH photographs are at least five places apart)", () => {
    const pos = (src: string) => PORTFOLIO_IMAGES.findIndex((p) => p.source === src);
    expect(Math.abs(pos("Ben&Precious_HD-23.jpg") - pos("Ben&Precious_HD-9.jpg"))).toBeGreaterThanOrEqual(5);
    expect(Math.abs(pos("DHExperience 2020-83.jpg") - pos("DH-FreeVidShoot-220.jpg"))).toBeGreaterThanOrEqual(5);
  });
  it("needs no CMS, database or remote image host", () => {
    for (const f of ["./gallery.ts", "./ConnectGallery.tsx", "./ConnectView.tsx", "./page.tsx"]) expect(read(f), f).not.toMatch(/contentRepository|sanity|supabase|fetch\(|cdn\./i);
  });
});
