import type { EditionRequest, EligibilityCheck, GateBlock, PortfolioContent } from "./types";

// THE PERMISSION GATE. For an EXTERNAL edition every photograph is checked, one by one, against the library's own two-stage eligibility (client permission for the destination AND internal approval),
// evaluated now. One photograph without both blocks the whole edition: nothing is silently dropped, so what was approved is exactly what is printed. A photograph appearing in two categories is checked once.
// An INTERNAL PREVIEW is never blocked, but reports every photograph that would block an external edition.
export const FILES = (c: PortfolioContent) => Array.from(new Set(c.categories.flatMap((cat) => cat.items.map((i) => i.fileId))));

export async function evaluateGate(req: EditionRequest, check: EligibilityCheck): Promise<{ blocked: GateBlock[]; checked: number }> {
  const byFile = new Map<string, string>();
  for (const cat of req.content.categories) for (const i of cat.items) if (!byFile.has(i.fileId)) byFile.set(i.fileId, cat.title);
  const blocked: GateBlock[] = [];
  for (const [fileId, category] of byFile) {
    let r: Awaited<ReturnType<EligibilityCheck>>;
    try { r = await check(fileId, req.destination); } catch { r = { eligible: false, rightsReason: "check_failed", internalReason: "check_failed" }; } // fail CLOSED
    if (!r.eligible) blocked.push({ fileId, category, reason: r.rightsReason !== "ok" && r.rightsReason ? `permission: ${r.rightsReason}` : `internal approval: ${r.internalReason}` });
  }
  return { blocked, checked: byFile.size };
}
