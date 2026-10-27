// LOCAL PROOF OF CONCEPT: renders the sample document to a file in Node (same component the browser button uses). Usage: npx tsx scripts/pdf-poc.tsx <out.pdf>
import path from "node:path";
import { renderToFile } from "@react-pdf/renderer";
import { registerPocFonts } from "../src/lib/pdf/poc/fonts";
import { OrdiftPocDocument } from "../src/lib/pdf/poc/OrdiftPocDocument";
import React from "react";

const root = path.resolve(process.cwd());
registerPocFonts(path.join(root, "public/fonts/pdf-poc"));
const out = process.argv[2] ?? "poc.pdf";
const t0 = Date.now();
renderToFile(React.createElement(OrdiftPocDocument, { logoWhite: path.join(root, "public/brand/logo-full-white.png"), photo: path.join(root, "public/pdf-poc/placeholder-3600x2400.jpg"), stampDate: "27 Oct 2026" }) as never, out)
  .then(() => console.log(`rendered ${out} in ${Date.now() - t0} ms`));
