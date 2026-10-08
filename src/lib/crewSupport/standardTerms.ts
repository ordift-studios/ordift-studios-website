import { getLegalDocument } from "@/lib/legal/registry";
import type { LegalContentNode } from "@/lib/legal/types";
import { siteUrl } from "@/lib/shared/env";

// Ordift's APPROVED Master Booking Terms & Conditions (OS-LGL-004) may be
// referenced from a Creative Crew Support quotation ONLY where the
// approved document itself shows it covers this service. This does not
// assume — it reads the document's own "Scope of Application" clause and
// requires the wording that the terms apply to every service Ordift
// offers (and that the document is registered as approved). If that
// wording ever changes, the reference stops being offered. Nothing legal
// is generated or restated: the reference only names the document, its
// version and its live URL, and is inserted by an explicit click, never
// silently.

function textOf(nodes: LegalContentNode[]): string {
  return nodes
    .map((n) => (n.type === "paragraph" || n.type === "subheading" ? n.text : n.type === "list" ? n.items.join(" ") : n.type === "table" ? n.rows.flat().join(" ") : ""))
    .join(" ");
}

export type BookingTermsApplicability =
  | { applies: true; reference: string; citation: string }
  | { applies: false; reason: string };

// Pure so the rule itself is testable: the scope clause must state that the
// terms apply to every service Ordift offers.
export function scopeStatesEveryService(scopeText: string): boolean {
  return /apply to every service offered by Ordift Studios/i.test(scopeText);
}

export function bookingTermsApplicability(): BookingTermsApplicability {
  const doc = getLegalDocument("booking");
  if (!doc) return { applies: false, reason: "The Master Booking Terms are not registered." };
  if (doc.control.status !== "approved") return { applies: false, reason: "The Master Booking Terms are not approved." };
  const scope = doc.sections.find((s) => s.id === "scope-of-application");
  const scopeText = scope ? textOf(scope.content) : "";
  if (!scopeStatesEveryService(scopeText)) {
    return { applies: false, reason: "The approved Booking Terms' Scope of Application does not state that it covers every Ordift service, so it can't be assumed to cover Creative Crew Support." };
  }
  const c = doc.control;
  return {
    applies: true,
    reference: `This quotation is subject to Ordift Studios' ${c.documentTitle} (${c.documentCode}, version ${c.version}), available at ${siteUrl()}/legal/booking.`,
    citation: `${c.documentCode} v${c.version}, clause ${scope!.number} (Scope of Application): “These Terms apply to every service offered by Ordift Studios…”`,
  };
}

// Kept for the editor: the sentence to insert, or null when the approved
// terms don't demonstrably cover this service.
export function approvedBookingTermsReference(): string | null {
  const a = bookingTermsApplicability();
  return a.applies ? a.reference : null;
}
