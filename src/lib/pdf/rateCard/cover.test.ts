import { describe, expect, it } from "vitest";
import path from "node:path";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { registerBrandFonts } from "../fonts";
import { COVER_PANEL_OPACITY, coverProxyUrl, coverWording, isCoverImageAllowed, sanityCoverScope, validateCover } from "./cover";
import { RateCardDocument } from "./RateCardDocument";
import { SAMPLE_RATE_CARD } from "./sample";
import { unknownKeys, validateRateCard } from "./validate";
import type { RateCardContent } from "./types";

const SANITY = "https://cdn.sanity.io/images/ixbvr1n8/production/0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1333x2000.jpg";
const card = (market: "qatar" | "ghana", acts: string[] | null, over: Partial<RateCardContent> = {}): RateCardContent => ({
  ...SAMPLE_RATE_CARD,
  meta: { ...SAMPLE_RATE_CARD.meta, marketSlug: market, marketName: market === "qatar" ? "Qatar / GCC" : "Ghana / West Africa", ...(acts ? { issuingEntity: { jurisdiction: market === "qatar" ? "Qatar" : "Ghana", name: "Ordift Studios", checkedOn: "2026-10-28", licensedActivities: acts } } : {}) },
  coverImage: "/pdf/cover-placeholder.jpg", ...over,
});

describe("cover wording is derived from verified activities, never typed", () => {
  it("Qatar, photography verified: 'Photography Services' and 'Qatar Edition' — never film", () => {
    const w = coverWording(card("qatar", ["photography"]));
    expect(w).toEqual({ descriptor: "Photography Services", edition: "Qatar Edition" });
    expect(JSON.stringify(w)).not.toMatch(/film|video/i);
  });
  it("Ghana, photography and videography: 'Photography & Film Services' and 'Ghana Edition' (the market name 'Ghana / West Africa' is not used)", () => {
    expect(coverWording(card("ghana", ["photography", "videography"]))).toEqual({ descriptor: "Photography & Film Services", edition: "Ghana Edition" });
  });
  it("the wedding variation uses wedding wording but still only the verified services", () => {
    expect(coverWording(card("ghana", ["photography", "videography"], { cover: { variant: "wedding", focusY: 1 } })).descriptor).toBe("Wedding Photography & Film");
    expect(coverWording(card("ghana", ["photography"], { cover: { variant: "wedding", focusY: 1 } })).descriptor).toBe("Wedding Photography");
  });
  it("a service that is not verified is never named: other activities and no entity give no descriptor", () => {
    expect(coverWording(card("ghana", ["drone_operations", "graphic_design"])).descriptor).toBeNull();
    expect(coverWording(card("ghana", null)).descriptor).toBeNull();
    expect(coverWording(card("qatar", ["videography"])).descriptor).toBe("Film Services");   // film only if it is the verified service
  });
});

describe("cover photograph references", () => {
  it("accepts a bundled /pdf/ image or an uploaded Sanity asset address; nothing else", () => {
    expect(isCoverImageAllowed("/pdf/cover-placeholder.jpg")).toBe(true);
    expect(isCoverImageAllowed(SANITY)).toBe(true);
    for (const bad of ["http://cdn.sanity.io/images/p/d/a-1x1.jpg", "https://evil.example/images/p/d/a-1x1.jpg", `${SANITY}?w=10`, "data:image/jpeg;base64,AAAA", "/etc/passwd", "/pdf/../secret.jpg", "https://cdn.sanity.io/files/p/d/a.pdf", "//cdn.sanity.io/images/p/d/a-1x1.jpg"]) expect(isCoverImageAllowed(bad), bad).toBe(false);
  });
  it("the project and dataset are read from the address so the server route can pin them; the browser fetches through the same-origin route", () => {
    expect(sanityCoverScope(SANITY)).toEqual({ projectId: "ixbvr1n8", dataset: "production" });
    expect(coverProxyUrl(SANITY)).toBe(`/api/admin/pricing/rate-card/cover?src=${encodeURIComponent(SANITY)}`);
  });
});

describe("cover rules at draft and at approval", () => {
  it("the wedding variation exists for Ghana only", () => {
    expect(validateCover(card("qatar", ["photography"], { cover: { variant: "wedding", focusY: 1 } }), "draft").errors.join(" ")).toMatch(/only available for the Ghana/);
    expect(validateCover(card("ghana", ["photography"], { cover: { variant: "wedding", focusY: 1, cleared: true, clearedNote: "Founder" } }), "approval").errors).toEqual([]);
  });
  it("the crop position stays between 0 and 1", () => {
    for (const y of [-0.1, 1.2, Number.NaN]) expect(validateCover(card("ghana", ["photography"], { cover: { variant: "standard", focusY: y } }), "draft").errors.join(" ")).toMatch(/between 0 and 1/);
  });
  it("clearance of the photograph is a warning in a draft and blocks approval; so does a cover that names no service", () => {
    const c = card("ghana", ["photography"]);
    expect(validateCover(c, "draft")).toMatchObject({ errors: [], warnings: [expect.stringMatching(/Confirm that Ordift may use the cover photograph/)] });
    expect(validateCover(c, "approval").errors.join(" ")).toMatch(/may use the cover photograph/);
    expect(validateCover(card("ghana", null, { cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder" } }), "approval").errors.join(" ")).toMatch(/names no service/);
    expect(validateCover(card("ghana", ["photography"], { cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder" } }), "approval").errors).toEqual([]);
  });
  it("a cover image from anywhere else is an error even in a draft, and the cover block cannot carry other fields", () => {
    expect(validateRateCard(card("ghana", ["photography"], { coverImage: "https://evil.example/a.jpg" }), "draft").errors.join(" ")).toMatch(/uploaded through the rate card builder/);
    expect(unknownKeys({ ...card("ghana", ["photography"]), cover: { variant: "standard", focusY: 0.5, price: 1 } as never })).toEqual(["cover.price"]);
  });
});

describe("the real document: one cover page, flush panel, no overflow page", () => {
  it("adding the full-page photograph and panel adds no page, at the approved opacity", async () => {
    registerBrandFonts(path.join(process.cwd(), "public/fonts/pdf"));
    const logo = path.join(process.cwd(), "public/brand/logo-full-white.png");
    const status = { state: "draft" as const };
    const pages = async (c: RateCardContent) => { const b = await renderToBuffer(React.createElement(RateCardDocument, { content: c, status, logoWhite: logo }) as never); return { pages: Number(/\/Count (\d+)/.exec(b.toString("latin1"))?.[1]), head: b.subarray(0, 5).toString() }; };
    const withPhoto = await pages(card("ghana", ["photography"], { coverImage: path.join(process.cwd(), "public/pdf/cover-placeholder.jpg") }));
    const without = await pages(card("ghana", ["photography"], { coverImage: "" }));
    expect(withPhoto.head).toBe("%PDF-");
    expect(withPhoto.pages).toBe(without.pages);
    expect(COVER_PANEL_OPACITY).toBe(0.7);
  });
});

describe("the administrative workflow discloses what an uploaded photograph is", () => {
  const html = async (c: RateCardContent, uploadCover?: unknown) => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Editor } = await import("./ui/RateCardEditor");
    return renderToStaticMarkup(React.createElement(Editor, { content: c, onChange: () => {}, readOnly: false, status: { state: "draft" }, today: "2026-10-28", filename: "x.pdf", ...(uploadCover ? { uploadCover: uploadCover as never } : {}) }));
  };
  it("says plainly that uploaded photographs are publicly reachable, next to the upload control and the clearance box", async () => {
    const out = await html(card("ghana", ["photography"]), async () => ({ ok: false as const, error: "x" }));
    expect(out).toContain("Uploaded photographs are publicly reachable.");
    expect(out).toContain("anyone who has its exact address can open it");
    expect(out).toContain("an uploaded photograph is publicly reachable at its address");
    expect(out.indexOf("cover-public-notice")).toBeLessThan(out.indexOf("cover-file"));
  });
  it("flags that a guidance-based service scope is not independently verified", async () => {
    const withBasis = card("ghana", ["photography", "videography"]); withBasis.meta.issuingEntity = { ...withBasis.meta.issuingEntity!, basis: "approved Ghana guidance (no activity licence is needed for ordinary photography or videography)" };
    expect(await html(withBasis)).toContain("not independent verification");
    expect(await html(card("qatar", ["photography"]))).not.toContain("cover-basis-notice");
  });
  it("approval needs the photograph cleared, whatever else is complete", () => {
    const c = card("ghana", ["photography"]);
    expect(validateRateCard(c, "approval").errors.join(" ")).toMatch(/may use the cover photograph/);
    expect(validateRateCard({ ...c, cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder's own statement" } }, "approval").errors.join(" ")).not.toMatch(/may use the cover photograph/);
  });
});
