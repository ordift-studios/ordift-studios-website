// One-off export: TS content → JSON, so the Python publication
// generator (scripts/generateLegalPublication.py) has a single source
// of truth in src/lib/legal/documents/ instead of duplicating prose.
// Run: npx tsx scripts/exportLegalDocumentJson.ts <slug> <outFile>
import { writeFileSync } from "fs";
import { getLegalDocument } from "../src/lib/legal/registry";

const [, , slug, outFile] = process.argv;
if (!slug || !outFile) {
  console.error("Usage: npx tsx scripts/exportLegalDocumentJson.ts <slug> <outFile>");
  process.exit(1);
}

const doc = getLegalDocument(slug);
if (!doc) {
  console.error(`No registered legal document for slug "${slug}"`);
  process.exit(1);
}

writeFileSync(outFile, JSON.stringify(doc, null, 2));
console.log(`Wrote ${outFile}`);
