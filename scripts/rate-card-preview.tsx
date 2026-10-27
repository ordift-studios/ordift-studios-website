// LOCAL: renders the placeholder rate card to a PDF in Node (same component the browser uses). Usage: node .poc-build/rate-card-preview.mjs <out.pdf> [draft|approved]
import path from "node:path";
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { registerBrandFonts } from "../src/lib/pdf/fonts";
import { RateCardDocument } from "../src/lib/pdf/rateCard/RateCardDocument";
import { SAMPLE_RATE_CARD } from "../src/lib/pdf/rateCard/sample";

const root = process.cwd();
registerBrandFonts(path.join(root, "public/fonts/pdf"));
const t0 = Date.now();
const content = { ...SAMPLE_RATE_CARD, coverImage: path.join(root, "public/pdf/cover-placeholder.jpg") };
renderToFile(React.createElement(RateCardDocument, { content, status: { state: "draft" }, coverPanelOpacity: Number(process.argv[3] ?? 0.8), logoWhite: path.join(root, "public/brand/logo-full-white.png") }) as never, process.argv[2] ?? "rate-card.pdf")
  .then(() => console.log(`rendered in ${Date.now() - t0} ms`));
