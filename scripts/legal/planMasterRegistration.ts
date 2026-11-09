// LOCAL, OFFLINE. Plans the registration of a new version of a legal master from its two stored master files. It reads the two files from disk, validates them (hashes, paths,
// version, counsel-review markers) and writes the registration migration, its guarded rollback and a read-only verification. It uses no network, no database and no secret, and it
// uploads nothing: storing the files in the private legal-masters bucket is a separate, separately authorised step.
//
//   npx tsx scripts/legal/planMasterRegistration.ts --code OS-LGL-014 --version 1.1 --docx <file.docx> --pdf <file.pdf> --docx-path masters-docx/OS-LGL-014/<name>.docx --pdf-path masters-pdf/OS-LGL-014/<name>.pdf --out <dir> [--existing existing.json]
//
// existing.json (optional) = the registry's current rows for the master: { masterExists, currentVersionId, versions: [{ id, version, status, legacyCode, docxPath, docxSha256, pdfPath, pdfSha256 }] }.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderRegistrationSql, renderRollbackSql, renderVerificationSql, sha256Hex, validateRegistrationPlan, verifyMasterFiles, type ExistingMasterFacts } from "../../src/lib/legal/masterRegistrationPlan";

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const need = (k: string) => { const v = arg(k); if (!v) { console.error(`Missing --${k}`); process.exit(2); } return v; };

const code = need("code"), version = need("version"), docxFile = need("docx"), pdfFile = need("pdf"), docxPath = need("docx-path"), pdfPath = need("pdf-path"), out = need("out");
const docx = new Uint8Array(readFileSync(docxFile)), pdf = new Uint8Array(readFileSync(pdfFile));
const plan = { code, version, docxPath, docxSha256: sha256Hex(docx), pdfPath, pdfSha256: sha256Hex(pdf) };
const existing: ExistingMasterFacts = arg("existing") ? JSON.parse(readFileSync(arg("existing")!, "utf8")) : null;

const verdict = validateRegistrationPlan(plan, existing);
const files = verifyMasterFiles(plan, docx, pdf);
for (const w of verdict.warnings) console.log(`WARNING: ${w}`);
const errors = [...(verdict.ok ? [] : verdict.errors), ...(files.ok ? [] : files.errors)];
if (errors.length) { console.error("REFUSED. Nothing was written."); for (const e of errors) console.error(` - ${e}`); process.exit(1); }

mkdirSync(out, { recursive: true });
const base = `${code}_v${version}`;
writeFileSync(join(out, `PROPOSAL_${base}_registration.sql`), renderRegistrationSql(plan));
writeFileSync(join(out, `ROLLBACK_${base}_registration.sql`), renderRollbackSql(plan));
writeFileSync(join(out, `VERIFY_${base}_registration.sql`), renderVerificationSql(plan));
console.log(`OK. Wrote 3 files to ${out}\n  Word SHA-256 ${plan.docxSha256}\n  PDF  SHA-256 ${plan.pdfSha256}\n  unresolved review markers: 0`);
