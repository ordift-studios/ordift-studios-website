// LOCAL PROOF OF CONCEPT: portfolio-scale stress test with DISTINCT images. Usage: node .poc-build/pdf-poc-stress.mjs <dir> <pages> <out.pdf>
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Image, Page, Text, View, renderToFile } from "@react-pdf/renderer";
const [dir, n, out] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
const t0 = Date.now();
const doc = React.createElement(Document, null, ...Array.from({ length: n }, (_, i) => React.createElement(Page, { key: i, size: "A4", style: { padding: 0 } },
  React.createElement(Image, { src: path.join(dir, files[i % files.length]), style: { width: "100%", height: 640, objectFit: "cover" } }), React.createElement(View, { style: { padding: 40 } }, React.createElement(Text, null, `Placeholder ${i + 1}`)))));
renderToFile(doc as never, out).then(() => console.log(`${n} pages -> ${out} in ${Date.now() - t0} ms`));
