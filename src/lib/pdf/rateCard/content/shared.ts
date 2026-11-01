import { QUOTATION_NOTES } from "./quotationNotes";
import type { Registry } from "./schema";

// Custom-quotation notes (approved, Phase 2D) are wired in here. Section introductions, section notes, terms blocks and contact lines are NOT approved yet and stay as visible [PLACEHOLDER] text in a draft.
export const SECTIONS: Registry["sections"] = QUOTATION_NOTES;
export const CONDITIONS: Registry["conditions"] = {};
export const CONTACT: Registry["contact"] = {};
