// LOCAL QUALITY HARNESS: renders stress documents (long text, many items, large/small/missing cover, approved status) for PDF auditing. Usage: node .poc-build/rate-card-quality.mjs <outDir> <smallCover> <largeCover>
import path from "node:path";
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { registerBrandFonts } from "../src/lib/pdf/fonts";
import { RateCardDocument } from "../src/lib/pdf/rateCard/RateCardDocument";
import { SAMPLE_RATE_CARD } from "../src/lib/pdf/rateCard/sample";
import type { RateCardContent, RateCardItem } from "../src/lib/pdf/rateCard/types";

const [out, small, large] = [process.argv[2], process.argv[3], process.argv[4]];
const root = process.cwd(); registerBrandFonts(path.join(root, "public/fonts/pdf"));
const logo = path.join(root, "public/brand/logo-full-white.png"); const cover = path.join(root, "public/pdf/cover-placeholder.jpg");
const long = "A long approved description written to test line wrapping and page breaks across several lines of body text in the pricing layout. ".repeat(10);
const item = (n: number, over: Partial<RateCardItem> = {}): RateCardItem => ({ key: `i${n}`, name: `Package ${n} with a deliberately long service name that has to wrap onto a second line`, description: n % 3 === 0 ? long : "Short approved description.", specs: ["2 hours", "20 edited images"], inclusions: Array.from({ length: n % 5 === 0 ? 14 : 3 }, (_, k) => `Inclusion line ${k + 1} for package ${n}`), price: { kind: n % 2 ? "fixed" : "from", amount: 1000 + n * 15, unit: "per booking" }, source: "manual", ...over });
const base = (): RateCardContent => ({ ...SAMPLE_RATE_CARD, coverImage: cover });
const many = (n: number): RateCardContent => ({ ...base(), sections: [0, 1, 2].map((s) => ({ key: `s${s}`, title: `Category ${s + 1}`, structure: "mixed" as const, items: Array.from({ length: n }, (_, k) => item(k + s * 100 + 1)), customQuotationNote: "[PLACEHOLDER] custom note" })) });
const jobs: [string, RateCardContent, "draft" | "approved"][] = [
  ["long-text", { ...base(), sections: [{ key: "s", title: "Long text", structure: "mixed", items: Array.from({ length: 6 }, (_, k) => item(k * 3 + 3)) }] }, "draft"],
  ["many-items", many(24), "draft"],
  ["cover-small", { ...base(), coverImage: small }, "draft"],
  ["cover-large", { ...base(), coverImage: large }, "draft"],
  ["cover-missing", { ...base(), coverImage: "" }, "draft"],
  ["approved", { ...base(), sections: [{ key: "s", title: "Approved", structure: "mixed", items: [item(1), item(2)] }] }, "approved"],
];
(async () => {
  for (const [name, content, st] of jobs) {
    const t0 = Date.now();
    await renderToFile(React.createElement(RateCardDocument, { content, status: st === "draft" ? { state: "draft" } : { state: "approved", editionId: "ED-1", approvedBy: "Founder", approvedAt: "2026-11-01T00:00:00Z", contentHash: "0123456789abcdef".repeat(4) }, logoWhite: logo, coverPanelOpacity: 0.7 }) as never, path.join(out, `${name}.pdf`));
    console.log(`${name}: ${Date.now() - t0} ms`);
  }
})();
