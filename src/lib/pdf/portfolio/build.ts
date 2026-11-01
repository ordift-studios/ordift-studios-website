import { checkUseEligibility } from "@/lib/portfolio/library";
import { evaluateGate } from "./gate";
import type { EditionRequest, EligibilityCheck, GateBlock, PortfolioContent, PortfolioMode } from "./types";

// Prepares the content for rendering. Nothing is stored, published or sent here; the caller renders the PDF and keeps it internal until a separately approved release step.
export type PreparedEdition = { ok: true; mode: PortfolioMode; content: PortfolioContent; wouldBlockExternal: GateBlock[] } | { ok: false; error: string; blocked: GateBlock[] };

export async function prepareEdition(req: EditionRequest, check: EligibilityCheck = checkUseEligibility): Promise<PreparedEdition> {
  const c = req.content;
  if (c.categories.length === 0 || c.categories.every((x) => x.items.length === 0)) return { ok: false, error: "The portfolio has no photographs.", blocked: [] };
  const gate = await evaluateGate(req, check);
  if (req.mode === "internal_preview") return { ok: true, mode: "internal_preview", content: c, wouldBlockExternal: gate.blocked };
  // external edition: strict
  if (gate.blocked.length > 0) return { ok: false, error: `${gate.blocked.length} photograph(s) lack the permission or internal approval required for ${req.destination}; an external edition cannot be built.`, blocked: gate.blocked };
  if (c.approvals.length === 0 || c.approvals.some((a) => !a.by.trim() || !a.at.trim() || !a.step.trim())) return { ok: false, error: "An external edition needs a recorded approval (who, when, what was approved).", blocked: [] };
  if (!c.editionLabel.trim()) return { ok: false, error: "An external edition needs an edition label.", blocked: [] };
  return { ok: true, mode: "external_edition", content: c, wouldBlockExternal: [] };
}
