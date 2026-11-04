// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONNECT_URL } from "@/app/connect/connectConfig";
import { CONNECT_QR_DESTINATION, MASTER_QR_FORMATS, getMasterQrFile, masterQrDownloadResponse, previewDataUri } from "./connectQr";
import { CONNECT_QR_MASTER } from "./connectQrMaster.generated";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p));
const text = (p: string) => read(p).toString("utf8");
const sha = (b: Uint8Array | Buffer) => createHash("sha256").update(b).digest("hex");

describe("the embedded masters are exactly the approved files in brand/qr/", () => {
  it("is byte-for-byte identical to the PNG and SVG in brand/qr/, and to the checksums recorded in the README", () => {
    const png = read("brand/qr/ordift-studios-connect-qr.png"), svg = read("brand/qr/ordift-studios-connect-qr.svg");
    expect(Buffer.from(CONNECT_QR_MASTER.png.base64, "base64").equals(png)).toBe(true);
    expect(Buffer.from(CONNECT_QR_MASTER.svg.text, "utf8").equals(svg)).toBe(true);
    expect(sha(png)).toBe(CONNECT_QR_MASTER.png.sha256);
    expect(sha(svg)).toBe(CONNECT_QR_MASTER.svg.sha256);
    const readme = text("brand/qr/README.md");
    expect(readme).toContain(CONNECT_QR_MASTER.png.sha256);
    expect(readme).toContain(CONNECT_QR_MASTER.svg.sha256);
  });
  it("serves exactly those bytes, with the expected file names and types", async () => {
    for (const format of MASTER_QR_FORMATS) {
      const res = masterQrDownloadResponse(format);
      const body = Buffer.from(await res.arrayBuffer());
      expect(sha(body)).toBe(CONNECT_QR_MASTER[format].sha256);
      expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="ordift-studios-connect-qr.${format}"`);
      expect(res.headers.get("Content-Length")).toBe(String(body.length));
    }
    expect(masterQrDownloadResponse("png").headers.get("Content-Type")).toBe("image/png");
    expect(masterQrDownloadResponse("svg").headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
  });
  it("the download is private: never cached, never indexed, never sniffed", () => {
    for (const format of MASTER_QR_FORMATS) {
      const h = masterQrDownloadResponse(format).headers;
      expect(h.get("Cache-Control")).toBe("private, no-store");
      expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });
  it("the PNG is a square 1-bit black-and-white image at the approved size", () => {
    const png = getMasterQrFile("png").body;
    expect(Buffer.from(png.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect([dv.getUint32(16), dv.getUint32(20), png[24], png[25]]).toEqual([3280, 3280, 1, 0]);                // width, height, bit depth 1, greyscale
  });
  it("the SVG is plain filled black-and-white shapes only: no script, event handler, link, image, stroke or external reference", () => {
    const svg = getMasterQrFile("svg");
    const s = Buffer.from(svg.body).toString("utf8");
    expect(s).toContain('viewBox="0 0 41 41"');
    expect(s).not.toMatch(/<script|<foreignObject|<image|<use|<a[ >]|<style|\son[a-z]+=|href=|xlink|javascript:|stroke|<!ENTITY|<!DOCTYPE/i);
    expect([...new Set(s.match(/fill="(#[0-9a-f]+)"/g))].sort()).toEqual(['fill="#000000"', 'fill="#ffffff"']);
    expect(s.match(/https?:\/\/[^"<\s)]+/g)!.map((u) => u.replace(/\.$/, ""))).toEqual(["http://www.w3.org/2000/svg", "https://ordiftstudios.com/connect", "https://ordiftstudios.com/connect"]);   // namespace, title, description (a sentence ends with a full stop)
  });
  it("the page preview is built from the same embedded SVG", () => {
    expect(previewDataUri().startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(Buffer.from(previewDataUri().split(",")[1], "base64").toString("utf8")).toBe(CONNECT_QR_MASTER.svg.text);
  });
});

describe("the destination is fixed", () => {
  it("is exactly the permanent card page, matching the card page's own address", () => {
    expect(CONNECT_QR_DESTINATION).toBe("https://ordiftstudios.com/connect");
    expect(CONNECT_QR_DESTINATION).toBe(CONNECT_URL);
    expect(CONNECT_QR_MASTER.destination).toBe(CONNECT_URL);
  });
  const RUNTIME = ["src/lib/qr/connectQr.ts", "src/app/admin/qr-codes/page.tsx", "src/app/admin/qr-codes/CopyUrlButton.tsx", "src/app/admin/qr-codes/download/png/route.ts", "src/app/admin/qr-codes/download/svg/route.ts"];
  const FILES = [...RUNTIME, "scripts/qr/embed-connect-qr.mjs"];            // the script runs offline on a developer machine and is not part of the application
  it("the only web address anywhere in the manager's code is the destination itself (nothing to redirect, track or generate for)", () => {
    for (const f of FILES) {
      const urls = (text(f).replace(/\/\/ .*$/gm, "").match(/https?:\/\/[^\s"'`)<]+/g) ?? []);
      expect(urls.filter((u) => u !== "https://ordiftstudios.com/connect"), f).toEqual([]);
    }
  });
  it("the running code takes no input that could change it: no environment, request, parameters, forms, server actions, network calls or database access", () => {
    for (const f of RUNTIME) {
      const code = text(f).replace(/\/\/ .*$/gm, "");
      expect(code, f).not.toMatch(/process\.env|searchParams|request\.|formData|FormData|"use server"|<form|<input|fetch\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|createClient|supabase|sanity|XMLHttpRequest|WebSocket/i);
    }
    expect(text("scripts/qr/embed-connect-qr.mjs").replace(/\/\/ .*$/gm, "")).not.toMatch(/process\.env|fetch\(|https?\.request|XMLHttpRequest|supabase|sanity/i);
  });
  it("no third-party QR service, link shortener or tracking host, and no QR library, is referenced", () => {
    const all = [...FILES, "src/lib/qr/connectQrMaster.generated.ts"].map(text).join("\n");
    expect(all).not.toMatch(/qrserver|chart\.googleapis|qr-code-generator|qrcode\.com|goqr|bit\.ly|tinyurl|t\.co\/|rebrandly|utm_|api\.qr|from "(qrcode|segno|qr-image|qrcode-generator)"|require\("(qrcode|segno)"\)/i);
  });
  it("exactly one QR master pair exists in brand/qr/ (no second code for another address)", () => {
    const images = readdirSync(path.join(root, "brand/qr")).filter((f) => /\.(png|svg)$/i.test(f)).sort();
    expect(images).toEqual(["ordift-studios-connect-qr.png", "ordift-studios-connect-qr.svg"]);
  });
  it("the manager adds no database table or migration and no dependency", () => {
    const pkg = JSON.parse(text("package.json"));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) expect(dep, dep).not.toMatch(/qr/i);
  });
});
