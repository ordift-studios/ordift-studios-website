import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// SIGNATURE VAULT ISOLATION (static). A handwritten-signature image must never be reachable by ordinary document generation, the electronic-signature engine, a template or a URL.
const root = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : walk(p)) : [p]; });
const src = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(root, f).replaceAll("\\", "/");
const read = (r: string) => readFileSync(join(root, r), "utf8");
const IMPORT = /from\s+["'](@\/lib\/signatures\/vault|\.\/vault|\.\.\/signatures\/vault)["']/;

describe("only the vault's own actions and page use the vault", () => {
  it("no other production file imports it (in particular no document generator, template, signature engine or issuance code)", () => {
    const importers = src.filter((f) => IMPORT.test(readFileSync(f, "utf8"))).map(rel).filter((f) => !/\.(test|e2e)\.tsx?$/.test(f) && !/\.localdb\.e2e\.ts$/.test(f)).sort();
    expect(importers).toEqual(["src/app/admin/signature-vault/actions.ts", "src/app/admin/signature-vault/page.tsx"]);
  });
  it("the signature engine, agreement issuance, PDF/document generators and the legal document texts never mention the vault", () => {
    const files = src.map(rel).filter((f) => /^src\/lib\/(legal|pdf)\//.test(f) && !/\.(test|e2e)\.tsx?$/.test(f) && !/\.localdb\.e2e\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(read(f), f).not.toMatch(/signature[-_ ]?vault|signature_assets|signature_use_approvals|useApprovedSignature|consume_signature_approval/i);
  });
});

describe("no public path to the image", () => {
  it("the library never issues a URL for the image or a public URL, and never writes to a public bucket", () => {
    const lib = read("src/lib/signatures/vault.ts");
    expect(lib).not.toMatch(/createSignedUrl|createSignedUrls|getPublicUrl|publicUrl/);
    expect(lib).toMatch(/SIGNATURE_VAULT_BUCKET = "signature-vault"/);
  });
  it("the migration makes the bucket private, adds no storage policy for it, and keeps automatic use impossible", () => {
    const m = read("supabase/migrations/0179_signature_vault.sql");
    expect(m).toMatch(/'signature-vault', 'signature-vault', false/);
    expect(m).not.toMatch(/on storage\.objects/i);
    expect(m).toMatch(/automatic_use boolean not null default false check \(not automatic_use\)/);
    expect(m).toMatch(/restricted boolean not null default true check \(restricted\)/);
    expect(m).toMatch(/revoke all on public\.signature_assets, public\.signature_use_approvals, public\.signature_vault_events from anon, authenticated, service_role/);
    expect(m).not.toMatch(/grant [^;]*(delete|truncate)[^;]*to service_role/i);
  });
  it("the page and actions are Super Admin only and never render the image or a storage path", () => {
    const page = read("src/app/admin/signature-vault/page.tsx"), actions = read("src/app/admin/signature-vault/actions.ts");
    for (const t of [page, actions]) expect(t).toMatch(/isSuperAdmin/);
    expect(page).not.toMatch(/<img|next\/image|storagePath|storage_path|createSignedUrl/);
  });
});
