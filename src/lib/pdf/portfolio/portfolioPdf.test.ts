// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { registerBrandFonts } from "../fonts";
import { prepareEdition } from "./build";
import { evaluateGate } from "./gate";
import { PortfolioDocument, bannerFor, PREVIEW_BANNER } from "./PortfolioDocument";
import type { EligibilityCheck, PortfolioContent } from "./types";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const content = (extra: Partial<PortfolioContent> = {}): PortfolioContent => ({
  title: "Portfolio", editionLabel: "Portfolio, Edition 1", preparedOn: "2026-11-02", studioIntro: ["Ordift Studios is a creative studio."],
  categories: [{ key: "weddings", title: "Weddings", items: [{ fileId: "f1", imageSrc: PNG, caption: "A" }, { fileId: "f2", imageSrc: PNG }] }, { key: "events", title: "Events", items: [{ fileId: "f3", imageSrc: PNG }, { fileId: "f1", imageSrc: PNG }] }],
  contact: [{ label: "Website", value: "ordiftstudios.com" }], approvals: [{ step: "Edition approved", by: "Synthetic Approver", at: "2026-11-02T09:00:00Z" }], ...extra,
});
const allow = (ok: Record<string, boolean>): EligibilityCheck => async (id) => ({ eligible: ok[id] === true, rightsReason: ok[id] ? "ok" : "no_permission_on_record", internalReason: "ok" });

describe("the permission gate", () => {
  it("checks every photograph once, for the edition's destination, and reports each one that fails", async () => {
    const seen: string[] = [];
    const r = await evaluateGate({ content: content(), mode: "external_edition", destination: "portfolio" }, async (id, dest) => { seen.push(`${id}:${dest}`); return { eligible: id !== "f2", rightsReason: id === "f2" ? "no_permission_on_record" : "ok", internalReason: "ok" }; });
    expect(seen.sort()).toEqual(["f1:portfolio", "f2:portfolio", "f3:portfolio"]);            // f1 appears twice but is checked once
    expect(r.blocked).toEqual([{ fileId: "f2", category: "Weddings", reason: "permission: no_permission_on_record" }]);
  });
  it("fails CLOSED when the check itself fails", async () => {
    const r = await evaluateGate({ content: content(), mode: "external_edition", destination: "portfolio" }, async () => { throw new Error("db down"); });
    expect(r.blocked).toHaveLength(3);
  });
});

describe("external editions are strict; internal previews are separate", () => {
  it("one photograph without permission blocks the whole external edition (nothing is silently dropped)", async () => {
    const r = await prepareEdition({ content: content(), mode: "external_edition", destination: "portfolio" }, allow({ f1: true, f2: false, f3: true }));
    expect(r.ok).toBe(false); expect(!r.ok && r.blocked.map((b) => b.fileId)).toEqual(["f2"]);
  });
  it("the default checker is the library's: with the library disabled nothing is eligible, so no external edition can be built", async () => {
    const r = await prepareEdition({ content: content(), mode: "external_edition", destination: "portfolio" });
    expect(r.ok).toBe(false);
  });
  it("an external edition needs a recorded approval and an edition label", async () => {
    const ok = allow({ f1: true, f2: true, f3: true });
    expect((await prepareEdition({ content: content({ approvals: [] }), mode: "external_edition", destination: "portfolio" }, ok)).ok).toBe(false);
    expect((await prepareEdition({ content: content({ approvals: [{ step: "x", by: " ", at: "t" }] }), mode: "external_edition", destination: "portfolio" }, ok)).ok).toBe(false);
    expect((await prepareEdition({ content: content({ editionLabel: " " }), mode: "external_edition", destination: "portfolio" }, ok)).ok).toBe(false);
    expect((await prepareEdition({ content: content(), mode: "external_edition", destination: "portfolio" }, ok)).ok).toBe(true);
  });
  it("an internal preview is allowed with unpermitted photographs, and lists exactly what would block an external edition", async () => {
    const r = await prepareEdition({ content: content({ approvals: [] }), mode: "internal_preview", destination: "portfolio" }, allow({ f1: true }));
    expect(r.ok && r.wouldBlockExternal.map((b) => b.fileId)).toEqual(["f2", "f3"]);
  });
  it("an empty portfolio is refused", async () => { expect((await prepareEdition({ content: content({ categories: [] }), mode: "internal_preview", destination: "portfolio" })).ok).toBe(false); });
});

describe("rendering", () => {
  const render = async (mode: "internal_preview" | "external_edition") => { registerBrandFonts(path.join(process.cwd(), "public/fonts/pdf")); return Buffer.from(await renderToBuffer(createElement(PortfolioDocument, { content: content(), mode }) as never)); };
  it("both modes render a valid PDF; only the preview carries the banner", async () => {
    for (const m of ["internal_preview", "external_edition"] as const) { const b = await render(m); expect(b.subarray(0, 5).toString()).toBe("%PDF-"); expect(b.length).toBeGreaterThan(3000); }
    expect(bannerFor("internal_preview")).toBe(PREVIEW_BANNER); expect(bannerFor("external_edition")).toBeNull();
  }, 60000);
});

describe("the generator cannot publish, store or send", () => {
  it("imports only the library's read-only eligibility check, and no storage, email or write path", () => {
    const dir = path.join(process.cwd(), "src/lib/pdf/portfolio");
    for (const f of ["build.ts", "gate.ts", "PortfolioDocument.tsx"]) {
      const t = readFileSync(path.join(dir, f), "utf8");
      expect(t, f).not.toMatch(/recordUse|createPermissionRequest|addPortfolioCandidates|createCollection|answerPermissionRequest|storage\.from|sendEmail|\.insert\(|\.update\(|fetch\(/);
    }
    expect(readFileSync(path.join(dir, "build.ts"), "utf8")).toMatch(/import \{ checkUseEligibility \} from "@\/lib\/portfolio\/library"/);
  });
});
