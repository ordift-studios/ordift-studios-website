import type { EditionStatus, RateCardContent } from "./types";
import { validateRateCard } from "./validate";

// DESIGN ONLY (no database table exists for this yet — see supabase/proposals/PROPOSED_pdf_editions.sql). An approved edition is the exact content snapshot plus a SHA-256 of its
// canonical JSON, so the PDF can only be produced from the frozen text and prices and any later change is visibly a different edition.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
export async function contentHash(c: RateCardContent): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(c));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type FrozenEdition = { content: RateCardContent; status: Extract<EditionStatus, { state: "approved" }> };
export async function freezeEdition(content: RateCardContent, approver: { id: string; name: string }, now: Date, editionId: string): Promise<{ ok: true; edition: FrozenEdition } | { ok: false; errors: string[] }> {
  const v = validateRateCard(content, "approval");
  if (v.errors.length) return { ok: false, errors: v.errors };
  const snapshot = JSON.parse(canonicalJson(content)) as RateCardContent;   // a deep, detached copy: later edits to the draft cannot reach it
  return { ok: true, edition: { content: snapshot, status: { state: "approved", editionId, approvedBy: approver.name, approvedAt: now.toISOString(), contentHash: await contentHash(snapshot) } } };
}
