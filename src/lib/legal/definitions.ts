import type { DefinedTerm } from "./types";
import { listLegalDocuments } from "./registry";

// Aggregates every document's `definitions` list into one deduplicated
// glossary, keyed by term. This is the "reusable Definitions module"
// requested for OS-LGL-000 (Master Definitions Register) — seeded here
// with the terms actually defined in the approved OS-LGL-001 document
// (Section 2), since OS-LGL-000 itself has not been provided yet. Once
// it arrives, add it to registry.ts as a document like any other and
// its terms will flow into this same aggregation automatically — no
// consumer of this module needs to change.
//
// Designed to power (not yet wired to UI): inline glossary tooltips on
// a defined term's first use, a standalone glossary page, and
// cross-document term lookups.

let cache: Map<string, DefinedTerm> | null = null;

function buildIndex(): Map<string, DefinedTerm> {
  const index = new Map<string, DefinedTerm>();
  for (const doc of listLegalDocuments()) {
    for (const entry of doc.definitions) {
      const key = entry.term.trim().toLowerCase();
      // First definition wins if a term is ever defined in more than
      // one document — surfacing a conflict here would need a real
      // editorial decision, not a silent overwrite.
      if (!index.has(key)) index.set(key, entry);
    }
  }
  return index;
}

export function getDefinedTerms(): DefinedTerm[] {
  if (!cache) cache = buildIndex();
  return Array.from(cache.values());
}

export function lookupDefinedTerm(term: string): DefinedTerm | null {
  if (!cache) cache = buildIndex();
  return cache.get(term.trim().toLowerCase()) ?? null;
}
