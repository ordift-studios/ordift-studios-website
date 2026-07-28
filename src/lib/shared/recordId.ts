import { createAdminClient } from "@/lib/supabase/admin";

// Platform-wide sequential record ID standard (2026-07-27) — see
// RECORD_ID_STANDARD.md. Format: PREFIX-YYYY-NNNNNN, e.g.
// ENQ-2026-000001. Each prefix gets its own counter that resets every
// calendar year, generated atomically via public.next_record_sequence()
// (supabase/migrations/0013_record_ids_and_sheet_sync.sql) so two
// concurrent submissions never collide.
//
// Only WSH and ENQ are actually assigned by a live form today
// (Workshop Registrations, Contact Enquiries). The rest are reserved
// for modules that don't exist yet (Client Bookings, Model/Vendor/
// Employment Applications, Invoices, Projects) — declared here now so
// every future module follows the same convention from day one instead
// of inventing its own.
//
// Existing ORD-/WKS- prefixed records (the old date+random format) are
// NOT migrated or backfilled — only new records use this standard.
export const RECORD_PREFIXES = [
  "WSH", // Workshop Registration
  "BK", // Client Booking
  "ENQ", // Contact Enquiry
  "MDL", // Model Application
  "VND", // Vendor Application
  "EMP", // Employment Application
  "CLT", // Client
  "INV", // Invoice
  "PRJ", // Project
] as const;

export type RecordPrefix = (typeof RECORD_PREFIXES)[number];

// Throws on failure rather than returning a soft error — Supabase is
// the primary, required application database (see
// src/lib/supabase/primaryWrite.ts), so a caller that can't obtain a
// record ID can't proceed with the submission at all. Callers should
// catch this and fail the request (503) rather than let it propagate
// as an unhandled 500.
export async function generateRecordId(prefix: RecordPrefix, date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("next_record_sequence", {
    p_prefix: prefix,
    p_year: year,
  });

  if (error) {
    throw new Error(`[recordId] failed to generate ${prefix} record id: ${error.message}`);
  }

  const sequence = String(data as number).padStart(6, "0");
  return `${prefix}-${year}-${sequence}`;
}
