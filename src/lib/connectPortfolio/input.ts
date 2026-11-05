import { LIMITS } from "./model";
import type { OperationInput } from "./service";

// A server action receives whatever a browser (or anyone with a copy of the page's script) chooses to send. This reads it strictly into an operation; anything unexpected is refused, not coerced.
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const KEY_OPS = new Set(["moveUp", "moveDown", "hide", "restore", "remove"]);

export function parseOperationInput(raw: unknown): OperationInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.length <= 2000 ? v : null);
  if (typeof r.type !== "string") return null;
  if (KEY_OPS.has(r.type)) return isStr(r.key, 80) ? ({ type: r.type, key: r.key } as OperationInput) : null;
  switch (r.type) {
    case "moveTo": return isStr(r.key, 80) && typeof r.index === "number" && Number.isInteger(r.index) && r.index >= 0 && r.index < LIMITS.MAX_ITEMS ? { type: "moveTo", key: r.key, index: r.index } : null;
    case "addBuiltin": return isStr(r.builtinId, 120) ? { type: "addBuiltin", builtinId: r.builtinId } : null;
    case "editAlt": { const alt = text(r.alt); return isStr(r.key, 80) && alt !== null ? { type: "editAlt", key: r.key, alt } : null; }
    case "resetToOriginal": return { type: "resetToOriginal" };
    case "addUploaded": {
      const alt = text(r.alt);
      return isStr(r.assetId, 200) && alt !== null && typeof r.rightsConfirmed === "boolean" ? { type: "addUploaded", assetId: r.assetId, filename: text(r.filename) ?? null, alt, rightsConfirmed: r.rightsConfirmed } : null;
    }
    case "replace": {
      const alt = text(r.alt);
      return isStr(r.key, 80) && isStr(r.assetId, 200) && alt !== null && typeof r.rightsConfirmed === "boolean" ? { type: "replace", key: r.key, assetId: r.assetId, filename: text(r.filename) ?? null, alt, rightsConfirmed: r.rightsConfirmed } : null;
    }
    default: return null;
  }
}
