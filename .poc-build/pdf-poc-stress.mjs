// scripts/pdf-poc-stress.tsx
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Image, Page, Text, View, renderToFile } from "@react-pdf/renderer";
var [dir, n, out] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
var files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
var t0 = Date.now();
var doc = React.createElement(Document, null, ...Array.from({ length: n }, (_, i) => React.createElement(
  Page,
  { key: i, size: "A4", style: { padding: 0 } },
  React.createElement(Image, { src: path.join(dir, files[i % files.length]), style: { width: "100%", height: 640, objectFit: "cover" } }),
  React.createElement(View, { style: { padding: 40 } }, React.createElement(Text, null, `Placeholder ${i + 1}`))
)));
renderToFile(doc, out).then(() => console.log(`${n} pages -> ${out} in ${Date.now() - t0} ms`));
