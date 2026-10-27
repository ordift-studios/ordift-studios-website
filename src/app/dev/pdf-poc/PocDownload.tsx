"use client";

import { useState } from "react";

type Result = { ok: true; bytes: number; ms: number; pages: string } | { ok: false; error: string } | null;

// Generates the PDF entirely in this browser (nothing is sent to a server) and saves it through a normal file download.
export default function PocDownload() {
  const [state, setState] = useState<"idle" | "working">("idle");
  const [result, setResult] = useState<Result>(null);

  async function download() {
    setState("working"); setResult(null);
    const t0 = performance.now();
    try {
      const [{ pdf }, { registerPocFonts }, { OrdiftPocDocument }] = await Promise.all([import("@react-pdf/renderer"), import("@/lib/pdf/poc/fonts"), import("@/lib/pdf/poc/OrdiftPocDocument")]);
      registerPocFonts("/fonts/pdf-poc");
      const blob = await pdf(<OrdiftPocDocument logoWhite="/brand/logo-full-white.png" photo="/pdf-poc/placeholder-3600x2400.jpg" stampDate={new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />).toBlob();
      const head = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
      if (head !== "%PDF-") throw new Error("The generated file is not a PDF.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Ordift-Studios-Rate-Card-SAMPLE.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const r = { ok: true as const, bytes: blob.size, ms: Math.round(performance.now() - t0), pages: "3" };
      (window as unknown as { __pocLast?: unknown }).__pocLast = { ...r, type: blob.type, head };
      setResult(r);
    } catch (e) {
      const err = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      (window as unknown as { __pocLast?: unknown }).__pocLast = err;
      setResult(err);
    } finally { setState("idle"); }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <button id="download-pdf" type="button" onClick={download} disabled={state === "working"} style={{ padding: "10px 18px", fontSize: 15, fontWeight: 600, background: "#0b1220", color: "#f7f5f1", border: 0, borderRadius: 6, cursor: "pointer" }}>
        {state === "working" ? "Preparing PDF…" : "Download PDF"}
      </button>
      <p id="poc-status" aria-live="polite" style={{ marginTop: 14, color: "#333" }}>
        {result === null ? "" : result.ok ? `Downloaded: ${(result.bytes / 1024 / 1024).toFixed(2)} MB, ${result.pages} pages, ${result.ms} ms.` : `Could not create the PDF: ${result.error}`}
      </p>
    </div>
  );
}
